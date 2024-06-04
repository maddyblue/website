---
title: "Efficient Documentation Using SQL Grammar Diagrams"
date: 2016-03-16
tags:
  - posts
layout: layouts/post.njk
---

_(Also published on the [Cockroach Labs Blog](https://www.cockroachlabs.com/blog/efficient-documentation-using-sql-grammar-diagrams/).)_

As CockroachDB approaches beta, user documentation has become increasingly important, and one of the meatiest requirements is documentation of our SQL implementation. For inspiration, I researched how other databases have documented SQL. The most effective example I found was [SQLite’s grammar diagrams](https://sqlite.org/lang_altertable.html).

<img src="https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/sqlite-alter.png?v=1669682145015">

These diagrams feature easy-to-understand [railroad diagrams](https://en.wikipedia.org/wiki/Syntax_diagram) showing the possible options for a SQL statement. Compared to a [text representation](http://www.postgresql.org/docs/current/static/sql-altertable.html), these visual diagrams give users an intuitive way to explore the grammar and discover features.

<img src="https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/postgres-alter.png?v=1669682153030">

## Converting Grammar into Images with Yacc and EBNF

There are various programs that can take a well-specified grammar file and convert it into images. Of the ones I saw, I was most impressed with the [Railroad Diagram Generator](http://www.bottlecaps.de/rr/ui). It produces linked SVG images that can easily be embedded into a web page and manipulated. However, this generator requires input in [EBNF](https://en.wikipedia.org/wiki/Extended_Backus%E2%80%93Naur_Form) form. The [CockroachDB grammar](https://github.com/cockroachdb/cockroach/blob/master/sql/parser/sql.y) is defined in a yacc file, from which the `yaac` program generates source code that parses SQL. As yacc has a specified format, it is straightforward to parse and convert to EBNF. One program that does this is `yyextract` from the `cutils` package on many Linux distributions. `yyextract` produces just BNF files. But with some short regexes, it was possible to convert our `sql.y` into a valid EBNF file that the generator could understand.

<img src="https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/grant-ebnf.png?v=1669682167288">

## Inlining and Simplification AKA Documentation for Humans

With the proof-of-concept complete, I had much more work left to make these diagrams useful to humans. We now had one huge HTML page with every possible option, but what we really needed was something similar to what SQLite provides: a single image that displays top-level, useful information with options to go deeper. Taking `ALTER TABLE` as an example, it was clear where this would get tricky. `ALTER TABLE` contains a reference to `alter_table_cmds`, which allows any number of `alter_table_cmd` references separated by commas. That’s at least three different statements just to figure out what `ALTER TABLE` can do. Instead of clicking through to each of those, the useful ones should be inlined into the top `ALTER TABLE` statement. That is, instead of a referencing other statements, they should be included directly. I accomplished this by writing my own parser for EBNF, parsing the output of `yyextract`, modifying it, and then feeding it into the diagram generator. This reduced the depth of the statements and made them much more usable. I worked in other helpful simplifications as well. For example, I used a simplification rule to convert awkwardly-defined lists into a nice form with a feedback loop.

<img src="https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/alter_table_cmds.png?v=1669682179207">

However, there are other simplifications I would still like to implement. For example, many statements have `IF EXISTS` expressions. Currently, these statements have two expressions: one with and one without the `IF EXISTS` clause. A simplification that combines these two expressions into one would further reduce the complexity of some diagrams.

## How to Diagram Unimplemented SQL Statements

As CockroachDB is a new project, many esoteric or difficult parts of the full SQL grammar are not yet implemented. We allow for them in our parser, but they will always produce an error describing them as unimplemented. We want our documentation to be accurate and concise, not cluttered with notes about whether something displayed works or not, so we want to filter unimplemented expressions out of our generated diagrams. The `yyextract` tool used in the initial proof-of-concept outputs all of the parsing rules listed in the `sql.y` file, but not their implementations (or lack thereof). Thus, we needed a yacc parser that allows us to fully inspect the grammar. I was not able to find a Go package that could successfully parse our `sql.y` file. The Go tool itself has a [yacc parser and generator](https://github.com/golang/go/blob/master/src/cmd/yacc/yacc.go), but it is translated from a C program and was not built for this kind of inspection. Yacc is not a complicated language, so it made some sense to build a custom parser ourselves. I used the Go [text/template/parse](https://github.com/golang/go/tree/master/src/text/template/parse) package as a boilerplate, and modified it to produce a yacc AST. With the parsed yacc file in memory, it was possible to remove any expressions that were marked unimplemented as well as statements containing only unimplemented expressions.

## Summary

These tools allow us to automatically generate all of the SQL diagrams in our documentation. We have a document describing the [full grammar](https://www.cockroachlabs.com/docs/sql-grammar.html), as well as smaller pages listing [single statements](https://www.cockroachlabs.com/docs/create-database.html). All diagrams link references to the full grammar, making it simple to explore. The code for this is in our [repository](https://github.com/cockroachdb/cockroach/blob/master/pkg/cmd/docgen/diagrams.go). Now, anytime we modify the SQL grammar to add a new feature, all the diagrams can be regenerated with a single command.

<img src="https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/drop_stmt.png?v=1669682190090">
