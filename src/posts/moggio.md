---
title: "Implementing moggio: a cross-platform, multi-source music player in Go"
date: 2016-02-29
tags:
  - posts
layout: layouts/post.njk
---

Today I am announcing the release of [moggio 0.1.0](http://mogg.io/). moggio
is a cross-platform, multi-source music player written in
[Go](https://golang.org/). It runs on Windows, Linux, and Mac, can play
from over a dozen sources (Google Music, Soundcloud, etc.) and from as many
formats (MP3, Vorbis, etc.). Writing a cross-platform GUI application that
also needed access to the sound hardware was a new problem for me, and I
would like to share what I learned.

[<img src="https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/moggio.png?v=1669682097101" style="width:
100%">](https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/moggio.png?v=1669682097101)

# Motivation

A few years ago I had finished work on a [side
project](/blog/2013/06/26/go-read-open-source-google-reader-clone) and was
looking for something interesting and useful to do. At the time (and still)
I was listening to most of my music on Google Music. But I also had some
one-off tunes on Soundcloud, a few albums on Bandcamp and enjoyed a regular
dose of [SomaFM](https://somafm.com/). One of my oldest hobbies is collecting
old video game music from Nintendo and Super Nintendo games. The originals
come in these little (~10kB) assembly files that you can play if you have
an emulator for those devices that just emulates the sound hardware. These
I had to download from a Google Driver folder. I was using a Windows machine
at work, Linux at home, and a Mac on the side.

Each of the online music services had their own web interface. SomaFM has
a web player, but can also be played with other devices. The Nintendo files
required a different program on each machine. Overall I was using at least
half a dozen different programs to play music on a regular basis, depending on
what I was listening to and the computer I was using. What I wanted instead
was a single program that could run on all of my computers, use the same
interface, and play the music wherever it was. I wanted a single playlist
that could have Bandcamp, Soundcloud, Google Music, and certain tracks
from a Nintendo Sound File archive that lived on Google Drive or Dropbox,
and could also play Shoutcast radio. More than this, I wanted to be able to
use my keyboard's media keys, or whatever else I wanted, to control all of
this music listening. No more clicking into the Google Music or Soundcloud
tab just to hit pause or next.

Lastly I wanted this application to be in Go. All these requirements together
had all kinds of hard problems, and was lots of fun to build.

# Cross-Platform Desktop Interface

The biggest hurdle was, and still is, the UI. I had decided early on
that I wanted to use a website as the UI instead of one of the other GUI
solutions. Managing state is the hard part of this problem. The server is
where all the state is kept, since it's the thing playing the music. The UI
is a view into the state of the server. Most web applications I've worked on
before are partitioned somehow, usually by user. But in this case all views
have to be the same. If someone opens up a second tab to the same server, any
change performed in one tab must be immediately visible in the second. This
led me to the decision that requests (like next song, pause, play a specific
album, etc.) never return a result (besides success or failure). Instead,
the web app is listening on a web socket to which the server broadcasts
all state changes to all listening browsers. In this way all users or web
browser tabs see changes at the same time.

As the server is Go, having this kind of communication happening while
attempting to play music without skips and blips is achievable using
goroutines. But with the audio goroutine, the website handler, the data
broadcaster, source fetchers (things that get song lists from the various
places), there's a lot of common data structures that need to be read and
modified. I've played this game before using `sync.Mutex` locks and did
not enjoy it. This time around I tried a new strategy: one main control
goroutine that everything else issues commands to. All data lives in scope
of only that goroutine, meaning no locks are needed.

In general this solution is great. It prevented the possibility of deadlocks
and guaranteed that 2 goroutines would never simultaneously access the same
data. If whoever was issuing a command needed to wait for some data to be
returned, it could send a results or error channel over to the command loop,
which could then communicate back the result on the channel. Note you can't
use a normal function return because, say, you are doing a crawl of a Dropbox
account. During the crawl the control loop still needs to respond to other
data-mutating requests. When the crawl completes its results are issued in a
further command, which can then return results to the caller, if needed. The
two rules are don't do any slow thing in the control goroutine and no other
goroutine gets to read or write common data. This appears to be a common
solution, even if not a great one.

> I have never once not regretted using sync.Mutex in my Go code.

[@tqbf, 9 Nov 2015](https://twitter.com/tqbf/status/663827099015380992)

> Every time I need a concurrent map I end up with the
pass-desired-action-over-channel-send-back-result pattern. :( I put a
single-use reply channel on the action object itself and feel so dirty.

[@patio11, 10 Nov 2015](https://twitter.com/patio11/status/664071741715578880)

# Sound hardware and formats

Decoding the audio into playable data was the other hard part. Audio decoders
today are largely written and interfaced with in C. A cross-platform Go program
can't easily do that. The Go community has luckily already implemented many
decoders in Go without any use of C. I wrote a Nintendo music emulator to
handle that missing codec. A few others (Ogg Vorbis and Super Nintendo) have
no Go implementation yet (I started on both, but they are *hard*). For them
I found some C libraries that get compiled in when I have a C compiler handy
(hence the lack of inclusion for the Windows builds of some codecs listed
on the website). If someone wants a fun project to do, a Go Ogg Vorbis or
AAC decoder would be a welcome contribution.

After the audio files are decoded, they must be sent to the sound
hardware. There's a few options here, like using portaudio to cover all
operating systems. I opted to use that just for Mac and pulseaudio for Linux
user. Both of those call into a C library. Windows is the notable exception
because there's a Go library that makes syscalls directly into the sound
system, meaning it can be cross compiled without a C compiler from Linux.

# Summary

Mog is [open source on GitHub](https://github.com/maddyblue/moggio). I use it
everyday to play most of my music, and it does nearly everything I need it
to. It's still got some stability issues and rough edges, but it does what
it says on the box. If you're interested in contributing, some open problems
are Youtube and AAC support. I hope moggio improves how you listen to music.
