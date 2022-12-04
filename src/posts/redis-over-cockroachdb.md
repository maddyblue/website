---
title: "Redis Over CockroachDB"
date: 2016-02-03
tags:
  - posts
layout: layouts/post.njk
---

_(Also published on the [Cockroach Labs Blog](http://www.cockroachlabs.com/blog/could-cockroachdb-ever-replace-redis-a-free-fridays-experiment).)_

I recently started a new job at [Cockroach Labs](http://www.cockroachlabs.com/) where we are working on CockroachDB, a distributed, fault-tolerant SQL database. The goal of CockroachDB is to “make data easy,” and while it seems like a stretch now, we eventually want CockroachDB to be able to act as the entire state layer for web applications. We are currently addressing the SQL layer, and a full-text search like ElasticSearch is somewhere ahead on the product horizon. Since Cockroach Labs has a [Free Fridays](http://www.cockroachlabs.com/blog/can-a-4-day-work-week-work/) policy for work on experimental projects, I decided to use mine to experiment with implementing the Redis protocol on top of [CockroachDB](https://github.com/cockroachdb/cockroach), attempting to answer the question: Could CockroachDB ever replace Redis?

[Redis](http://redis.io/) is used in many organizations as a fast and feature-full cache, but not often as a persistent data store. This is because of its primarily in-memory nature and asynchronous replication strategy (where multi-node consistency is traded for higher performance). For organizations that do use Redis in a multi-node setup (either [master/slave](http://redis.io/topics/replication) or [Redis Sentinel](http://redis.io/topics/sentinel)), they must run additional software and configure their clients to support failover between nodes. Redis supports sharding (horizontal scaling) through [Redis Cluster](http://redis.io/topics/cluster-tutorial), which has similar limitations.  
  
Although I have only used Redis occasionally, I have been a part of organizations that [use it heavily](https://stackexchange.com/performance#redis). They and others have expended significant engineering effort to create [software](https://github.com/StackExchange/StackExchange.Redis) that can correctly failover between master and slave nodes during a node failure. And even with all that effort, they are still limited to Redis’ asynchronous replication that can lose data.

Redis, it appears to me, made some performance tradeoffs from the start: be fast by being single threaded with no synchronous replication to slave nodes. CockroachDB made the opposite tradeoffs: consistency and scaling first, then optimize to make up for performance loss.  

## Experimenting with Redis Over CockroachDB

I have now been working on this [Redis over CockroachDB](https://github.com/mjibson/cockroach/tree/redis) implementation for a few weeks with satisfying results. Currently, it is compiled directly into the main CockroachDB binary and binds to its own port that acts like a Redis server. The README file documents the supported commands, which include most of the list, set, and key commands. Various features aren’t implemented yet (key expiration, pub/sub, other data types), but my plan is to continue work to implement these over time.  
  
In order to ensure correctness, the [tests](https://github.com/mjibson/cockroach/tree/redis/redis/testdata) are structured so they can be run against a real Redis server and this one. The tests don’t test all possible combinations of commands (for example I had a bug where the `rename` command would only work for string types), but being able to compare to a real Redis instance, including error messages and types, has made implementing new commands and types fairly straightforward.

## Performance and Implementation

_[Note: We are still in Alpha and have lots of performance work to do.]_

Similar to the test environment, a benchmark environment was created that easily runs against a real Redis server to compare with the CockroachDB one. I had no idea what to expect during my first benchmarks. I was going to be happy if a single-node CockroachDB cluster was only 100 times slower than Redis. I was pleasantly surprised when the benchmarks showed that performance was between 10 and 20 times slower, depending on the operation. String and key read operations like `get` are on the better side of that (nearer 10x). Write operations like `set` are nearer 20x. These commands have mappings in CockroachDB to native operations. `incr` is notably as fast as `set` because CockroachDB can atomically increment.

Other data structures like lists and sets are slower, but that is more due to my poor implementation than CockroachDB. These data types are stored as [gob](https://golang.org/pkg/encoding/gob/)-encoded bytes, and so must be decoded on every use. This means that any list or set takes only one key in the key-value store, but must be fully sent and decoded for every operation. As the size of the list or set increases, performance worsens. This is a bad use of gob and a poor way to store data, however it was a quick solution for a proof-of-concept implementation. A better, future solution would be to store each item of a list as an individual item in some key space.

Some other features will be difficult to do at all. CockroachDB now has no event notifiers. `blpop` is implemented as a loop with a timeout that polls. Implementing something like `pub/sub` would have to use the same method. If there was some event system that broadcast to listeners on key put, these could be done well. This may happen in the future.

## Future Use: Could CockroachDB Ever Replace Redis?

I am working on [Redis over CockroachDB](https://github.com/mjibson/cockroach/tree/redis) only as an experiment. For now, it looks as though Redis is pretty safely in a different performance tier. That outcome isn’t a big surprise, as one is a featured-full cache and the other a strongly consistent database. However, it will be interesting to see how CockroachDB’s performance improves relative to Redis over time.

My personal goal is to make this a viable drop-in replacement for low- to medium-load Redis servers, but this requires support for nearly all Redis commands at reasonable performance. If it can get there, I hope that CockroachDB’s reduction in admin time compared to managing a Redis cluster offers enough benefit to be useful. This would make it possible to use a single CockroachDB cluster as both a SQL and Redis backend.

– – –

GitHub: [https://github.com/mjibson/cockroach/tree/redis](https://github.com/mjibson/cockroach/tree/redis)
