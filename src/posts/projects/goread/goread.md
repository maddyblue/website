---
title: "Go Read: Open-Source Google Reader Clone"
date: 2013-06-26
---

I would like to announce the release of [Go Read](https://github.com/maddyblue/goread). It as a Google Reader clone, and designed to be close to its simplicity and cleanliness. I wanted to build something as close to Google Reader as made sense for one person to build in a few months. Since the announcement, numerous clones have been written, and some existing ones were made known. I tried most of them and disliked them for various reasons. It seemed interesting and fun to make my own that would serve exactly my needs. I hope others find it useful.

[Try it out:](https://github.com/maddyblue/goread)

[<img style="width: 100%" src="https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/goread-all.png?v=1669682052644">](https://github.com/maddyblue/goread)

Specifically, I wanted:

1. importing of existing google reader and OPML feeds
1. a web page with decent mobile support
1. to not install anything ever
1. a relatively similar look to Google Reader
1. the same keyboard shortcut keys
1. snappy and fast

## implementation

Feed readers are difficult.

One of the biggest problems with the readers I tried over the last months was scalability. While on the front page of HN, they were slow and unusable. Many then ended up restricting their demo tier to something useless or took so long to import my feeds that I just forgot about them and never went back. I wanted to architect a reader whose scale would be limited only by how much I was willing to pay for servers. Newsblur's early tweets suggested that the database was the bottle neck - they could not simply add new machines because it was not designed to use them. I chose the [go](http://golang.org) runtime of [app engine](https://developers.google.com/appengine/) and attempted to design the data structures in a way that allowed concurrency. Depending on the traffic I get, we will see if I succeeded.

The second big difficulty is the lack of standards compliance. Most feeds are formatted more-or-less correctly, but you must support three formats (RSS, RDF, Atom). The number of date formats we encountered is comical (so much so that I [started a blog](http://rssdateformats.tumblr.com/) to document them). At current count, there are [around 60](https://github.com/maddyblue/goread/blob/0387db10bd9fd9ccd90d557fa30b6e494efa577a/goapp/utils.go#L129) date formats I've seen. There are others that are just not parsable:

- [Wed, 18 2012](http://www.threewordphrase.com/rss.xml)
- [Tue, 3 Febuary 2010 00:00:00 IST](http://www.airtightnetworks.com/fileadmin/rss/press_releases.xml)
- [Tue, 15 May 2012 24:05:00 UTC](http://us.blizzard.com/en-us/news/rss.xml)
- [čet, 24 maj 2012 00:00:00](http://www.alta.si/Rss/?id=1)

To make it snappy and fast, [angularjs](http://angularjs.org/) is used. A single page is loaded, and all interaction is JSON. Background requests are made to save read stories, save options, fetch the needed story content. This allows us to render changes to the user even if the server takes a bit to process them - we need to wait for returns to change the UI. Angular's data binding is just pleasant. It feels fast.

The entire source is [on github](https://github.com/maddyblue/goread) under the ISC license. Some other readers are open source, but appeared quite difficult to actually install. Using app engine allows go read to be easily run by anyone else by basically changing a single line; instructions are in the repo. A few hundred feeds can be run under the app engine free quota (number of users is basically unimportant to datastore use).

## future

Current costs are a few dollars a week. If HN ends up liking it, I assume that will multiply. I plan to add non-annoying ads that are removable with a modest fee to support it. If go read can pay for itself, I will be happy.

There are a few features that are not yet implemented and certainly some bugs. Having a full Google Reader API would be beneficial to the existing reader apps. Pubsubhubbub support is missing. I am unlikely to consider major UI changes or great deviations from the standard reader feature set, but good ones could be proposed. I plan on using go read and improving it as I can.
