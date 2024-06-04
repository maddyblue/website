---
title: "esc: Embedding Static Assets in Go"
date: 2014-11-19
---

With the release of [Bosun](http://bosun.org), I spent some time making
the installation process pleasant. This included embedding static web
assets directly into the go binary. I have done this before with [appstats](https://github.com/maddyblue/appstats)
and [miniprofiler](https://github.com/miniprofiler/go), but wanted to see the current state of public offerings,
and see if any fit my needs. I found three existing programs, but ended up
writing my own.

# requirements

I wanted a program that:

1. can take some directories and recursively embed all files in them in a way that was compatible with http.FileSystem
2. can optionally be disabled for use with the local file system for local development
3. will not change the output file on subsequent runs
4. has reasonable-sized diffs when files changed
5. is vendoring-friendly

Vendoring-friendly means that when I run [godep](https://github.com/tools/godep) or
[party](https://github.com/maddyblue/party), the static embed file will not
change. This means it must not have any third-party imports (since their
import path will be rewritten during `goimports`, and thus different than
what the tool itself produces), or a specifable location for the needed
third-party imports. Ideally, the output is completely self-contained and
needs no third-party libraries, meaning it includes its own implementation
of the http.FileSystem interface.

# [github.com/rakyll/statik](https://github.com/rakyll/statik)

statik is a relative newcomer to this space. It is written by a current Googler
and based on some techniques in [camlistore](http://camlistore.org/). It
creates a `statik.go` file in its own package with a giant .zip file embedded
as a string. A separate library provides this static file with the ability
to serve web content via a http.FileSystem interface. statik well met
requirement 1. But the others were not. I had to provide my own local mode,
the output file changed over time even when assets didn't, diffs were huge
on small changes since all files were bundled into one string, and it was
not vendoring-friendly.

I submitted a few patches, as the output of statik is not `go fmt`ed,
suggesting that this project is not highly used by its author.

# [github.com/jteeuwen/go-bindata](https://github.com/jteeuwen/go-bindata)

go-bindata has an impressive feature list, and met most of my requirements
(good diffs, local dev mode, kind of vendoring-friendly). However its http.FileSystem interface is done by a
different developer, and requires specifying many things that were already
specified in the bindata invocation, leading to easy errors and annoying
configuration. I wanted something that would produced a fully self-contained http.FileSystem interface.

# [github.com/GeertJohan/go.rice](https://github.com/GeertJohan/go.rice)

go.rice takes a different approach. The source code registers directories it
needs access to. A static-analysis tool embeds content in those directories
at a later time. However, since it is a static-analysis tool, only string
constants are supported in the directory list. This is not the style of tool
I prefer to use, although it does have compelling benefits, like being able
to specify needed directories in code instead of in scripts (like all other
programs here).

# [github.com/maddyblue/esc](https://github.com/maddyblue/esc)

esc is the tool I have thus built to meet exactly these goals, and I believe
it does so. It generates nice, gzipped strings, one per file. There is a
simple flag to enable local development mode, which is smart enough to not
strip directory prefixes off of filenames (an option in esc that is sometimes
needed). The output includes all needed code, and does not depend on any
third-party libraries for compatibility with http.FileSystem.

However, it does not offer advanced embedding options as many other tools
do. It is currently not easily accessible via non-http.FileSystem users. It
has no concept of a directory listing. And it is new and thus not widely
tested. But it otherwise seems to work great for easily embedding and testing
static assets.
