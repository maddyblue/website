---
title: "Time-Travel Queries: SELECT witty_subtitle FROM THE FUTURE"
date: 2016-06-22
---

*(Also published on the [Cockroach Labs Blog](https://www.cockroachlabs.com/blog/time-travel-queries-select-witty_subtitle-the_future/).)*

In our most recent beta, we added a new feature: time-travel queries. These are `SELECT` queries where you can specify a timestamp, and the data returned will be the data as it was at that time. This has various uses including backups, undo, historical reporting. Although this has been added to the [SQL:2011 standard](https://en.wikipedia.org/wiki/SQL:2011#Temporal_support), I'm not aware of any database that has implemented it. I'd like to introduce this feature: what it is, why we built it, and details about how it works for those interested in CockroachDB's lower layers.

## The Feature

A time-travel query returns data as it appeared at a specific time. It is enabled by adding `AS OF SYSTEM TIME <timestamp>` after the table name in a `FROM`.

`SELECT * FROM t AS OF SYSTEM TIME '2016-06-15 12:45:00'`

This returns all the rows of `t` as they appeared at the specified time.

The CockroachDB implementation of this feature requires that the timestamp be a literal string in a valid time format. We do not support generic expressions or even placeholder values here (sadly[1]). However, we are able to support schema changes between the present and the "as of" time. For example, if a column is deleted in the present but exists at some time in the past, a time-travel query requesting data from before the column was deleted will successfully return it.

This data is kept in the MVCC layer and garbage collected (GC) at some configurable rate (default is 24 hours and configurable by table). Time travel is supported at any time within the GC threshold.

A final restriction is that these statements are not supported in SQL transactions or subqueries. They may be in the future if there's enough need, and if we can figure out how to correctly implement them.

## Purpose

Time-travel queries were made as part of work being done on backups. CockroachDB provides [lockless transactions](https://www.cockroachlabs.com/blog/serializable-lockless-distributed-isolation-cockroachdb/), which allows operations to proceed without locking resources at the possibility of being aborted and forced to retry. Currently, a naive backup script performing a `SELECT *` on a large, write-heavy table could reasonably be restarted many times. 

Instead, our upcoming backup tool pages over the data in a table with separate queries but all at the same time using our above feature. These queries can still be aborted, but they can then retry without re-reading the entire table, and resume backup from where they left off.

As an added benefit, these also allow for backups of multiple tables to be done in parallel. Improving the speed of backup (and restore) is actively being worked on.

## Implementation Details

Broadly, this feature works by setting the timestamp of a request to the specified historical timestamp. All operations in CockroachDB have a timestamp, which is usually populated to the current time or start of the current transaction. With time-travel queries, this timestamp is modified, and the existing machinery operates as if it's gotten a normal command. Implementing it required three main changes:

[First](https://github.com/cockroachdb/cockroach/pull/6778), the GC was changed so that instead of removing any values older than its threshold, it kept any data needed to respond to queries within its threshold. Instead of removing data older than 24 hours, anything valid within the last 24 hours was kept.

[Second](https://github.com/cockroachdb/cockroach/pull/6992), commands outside the GC threshold for a given range (shard) return an error. Previously, if a read was sent with a timestamp before the oldest value that the GC kept, an empty (but successful) result was returned. I'm not aware of a situation where this could ever happen, but now it certainly can't.

[Third](https://github.com/cockroachdb/cockroach/pull/6992), the `AS OF SYSTEM TIME` syntax was hooked up to some new logic. This logic sets the timestamp of the transaction to the specified time and executes it (note that a single statement outside a SQL transaction gets converted into an implicit, single-statement transaction). The table schema fetch process uses this timestamp and gets the correct version of the schema. Type checking is performed. If everything is ok, the reads are executed. We didn't have to change any of the underlying logic in any non-SQL layer.

## Conclusion

Time-travel queries are awesome because they enable new features to be built and old data is cleaned up automatically by the system. They can be used to provide a consistent view of an entire cluster without using a SQL transaction, and thus have a much lower risk of being aborted by other queries. We built them for backups, but we think they will enable broader applications to be built on top of them.

[1] Placeholders are not supported because an expression needs to be type checked so the server can return to the client the expected types of the placeholders. Since we only know the timestamp, and thus the schema of the table, at statement execution time, we cannot always type check a statement. Consider `SELECT a+$1 FROM t AS OF SYSTEM TIME $2`. Here, `$1` could be a variety of types depending on the type of `a`. But until we know the "as of" time, we don't know which schema `t` had and thus can't determine the type of `a`. We could theoretically support placeholders here if there's exactly one placeholder and it is the "as of" time by delaying type checking until execution time, but we don't yet.
