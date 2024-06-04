---
title: 'Bursera: a PostgreSQL red-green parser experiment'
date: 2024-02-19
eleventyExcludeFromCollections: true
tags:
  - posts
layout: layouts/post.njk
---

Here's some problems those of us in the PostgreSQL ecosystem have:

### 1. Supporting Language Server protocol

The [Language Server protocol](https://langserver.org/) is a standard that allows VS Code and other editors to provide help while editing files: syntax highlighting and errors, completion hints, go to definition. A key feature required to make this work well is the ability to partially parse incomplete or incorrect statements. For example, in SQL you'd like to type

```
SELECT * FROM 
```

and have your editor drop down the tables in your database. But that statement is syntatically invalid (`FROM` must have a following `from_item`). We need a parser that knows how to parse what it can and return that and an error. Most SQL parsers don't do this and can't easily be taught to.

### 2. Pretty printing doesn't preserve comments or whitespace

I maintain [some](https://sqlfum.pt/) [SQL](https://mz.sqlfum.pt/) [pretty printers](https://wasm.sqlfum.pt/) and none of them are able to keep comments within a statement. This is because the parsers used by those pretty printers produce ASTs instead of lossless CSTs (a term new to me, think of it like an AST but you can also get all the original text including comments of any node).

### 3. Some errors can't say where they came from



### CSTs and ASTs

Supabase [described](https://supabase.com/blog/postgres-language-server-implementing-parser) their recent work to implement this for the Postgres SQL dialect, and describes a key problem about the C parser they wrapped. It:

> only exposes an API for the AST, not for the CST. To provide language intelligence on the source code, both are required.

ASTs are common concepts to me, but I'm not sure I had ever heard (or remembered) the term CST (concrete syntax tree) before. CSTs go inbetween lex'd tokens and the AST: lex -> CST -> AST. But we almost never hear about them because most parser produce the AST directly since the CST (until recently) sometimes has little value. My maybe correct mental model is that a CST is like if you kept the original text (including whitespace and comments) and applied a tree structure to it. For

```
SELECT a, b FROM
-- some comment
t
```

a CST might look like:

```
ROOT@0..34
  SELECT_STATEMENT@0..34
    QUERY@0..34
      SET_EXPR@0..34
        SELECT@0..34
          KEYWORD@0..6 "SELECT"
          PROJECTION@6..11
            DATA_TYPE@6..8
              RAW_NAME@6..8
                ITEM_NAME@6..8
                  WHITESPACE@6..7 " "
                  IDENT@7..8 "a"
              TYP_MOD@8..8
            COMMA@8..9 ","
            DATA_TYPE@9..11
              RAW_NAME@9..11
                ITEM_NAME@9..11
                  WHITESPACE@9..10 " "
                  IDENT@10..11 "b"
              TYP_MOD@11..11
          FROM@11..34
            WHITESPACE@11..12 " "
            KEYWORD@12..16 "FROM"
            COMMA_SEPARATED@16..34
              TABLE_FACTOR@16..34
                RAW_NAME@16..34
                  ITEM_NAME@16..34
                    WHITESPACE@16..17 "\n"
                    LINECOMMENT@17..32 "-- some comment"
                    WHITESPACE@32..33 "\n"
                    IDENT@33..34 "t"
```

A tree structure from the original text with enough data to compute the AST, but also including original whitespace and comments. The AST drops unneeded details, and puts things into data structures suitable for programming:

```
Select(
    SelectStatement {
        query: Query {
            ctes: Simple(
                [],
            ),
            body: Select(
                Select {
                    distinct: None,
                    projection: [
                        Expr {
                            expr: Identifier(
                                [
                                    Ident(
                                        "a",
                                    ),
                                ],
                            ),
                            alias: None,
                        },
                        Expr {
                            expr: Identifier(
                                [
                                    Ident(
                                        "b",
                                    ),
                                ],
                            ),
                            alias: None,
                        },
                    ],
                    from: [
                        TableWithJoins {
                            relation: Table {
                                name: Name(
                                    UnresolvedItemName(
                                        [
                                            Ident(
                                                "t",
                                            ),
                                        ],
                                    ),
                                ),
                                alias: None,
                            },
                            joins: [],
                        },
                    ],
                    selection: None,
                    group_by: [],
                    having: None,
                    options: [],
                },
            ),
            order_by: [],
            limit: None,
            offset: None,
        },
        as_of: None,
    },
)
```

### Go do this?

Implementing this fully (at [Materialize](https://materialize.com/)) would take months of work. Even a partial implementation (say, only `SELECT` statements) is probably one dedicated month, so call it two to three months factoring in all the other stuff we do. Sadly the combined user benefit of the above problems is less than the benefit of 2-3 months of work on other projects, so this is unlikely to happen soon or ever.

If I ever implement a parser from scratch in the future, I'm going to try out red-green from the start so that we can get LSP support, good errors, and comment-preserving pretty printing without a rewrite.


#### Related work:

[Syntax in rust-analyzer](https://github.com/rust-lang/rust-analyzer/blob/master/docs/dev/syntax.md)

[Persistence, façades and Roslyn’s red-green trees](https://ericlippert.com/2012/06/08/red-green-trees/)

[Postgres Language Server: implementing the Parser](https://supabase.com/blog/postgres-language-server-implementing-parser)
