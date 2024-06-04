---
title: "Go Read: One Year with Money and App Engine"
date: 2014-03-13
---

[Go Read](https://github.com/maddyblue/goread) began life [one year ago](https://github.com/maddyblue/goread/commit/55fd9885659977aa8298f89d91b11d860687a6b1). It began life the same day of the [Google Reader shutdown announcement](http://googlereader.blogspot.com/2013/03/powering-down-google-reader.html). It was released to the public in late June of 2013, and has been profitable since the start. I have never run a business, and was surprised that Go Read was profitable. I assumed it was operating at a slight loss, especially those first few months.

<img style="width: 100%" src="https://cdn.glitch.global/08c0c16c-42ba-47bd-aa4b-fdab79602d49/goread-2013-income.png?v=1669682085256">

For 2013, total subscription income was $7129 ($1188 per month). Total App Engine expense was $4048 ($647 per month). I'd like to discuss what I did to increase subscription income and decrease server costs.

# increasing income

Go Read is [free](https://github.com/maddyblue/goread). Its servers are not. I had hoped that its costs would have been low enough for me to handle myself, but at hundreds of dollars per month, I quickly changed my mind. I tried many approaches that did not work until the current one that does.

## volunteer payments

The first attempt was completely voluntary. I added a way to subscribe for $3/month or $30/year. However, it didn't actually do anything besides remove the button asking you to subscribe. There were no added features or removed ads. This yielded a few subscriptions, but not enough to cover costs. Many people were clearly happy to pay this early on, but most wanted to use it for free.

## ads for free

The second change was to display ads for non payers. I tried out Google's ads, both text and graphic. I did get enough click-throughs for a low income that may have covered its own server fees. Showing ads on an RSS reader, presented a few problems. First, it made the experience annoying and buggy. Second, it is impossible to meet Google's terms of service with an RSS reader. They dictate that ads may not be shown along adult or copyrighted content. Determining that for external sources of data was not going to happen. I got a few emails about violations and added a system to prevent ads on certain feeds. But I was playing whack-a-mole and it would never end. Eventually I made a mistake and they banned my site. I gave up on ads at this point.

## 30-day trial

The current system is the 30-day trial. You can try Go Read for free with all its features for 30 days. This includes the android app. At the end you must pay or go away. Most other paid feed readers have a free tier, but they limit the number of feeds you can view. I have never liked this because you can't ever get a full experience of the app with all of your feeds. Furthermore, I had already decided to not pay for other folk's server costs out of my pocket. Go Read is free software and takes minutes to run your own production instance, so there's no reason to complain.

This action cost me about 90% of my users. Many were angry and cursed at me on twitter. I agree that it is sad I did not say I was going to charge from the beginning, but I didn't know that I would be paying hundreds of dollars per month either. Again, it's free software so I'm not sure what the problem is. I learned from this experience that some people will never pay, and some will. I'm not opposed to alienating people who won't support all of the time, effort, and money I put into this product.

Forcing people to pay was the best choice I have made. Due to so many users leaving I was able to reduce costs greatly (now much less than $10/day) and providing a decent profit. I believe I would pay for some of the free services I used if they forced me to pay or leave.

# decreasing expense

For the App Engine-inclined of you, let's talk about quotas. App Engine provides a generous free quota that allows you to test almost any app on Google's production servers with real data. Until you get some real users you'll be below the limit. Go Read works on the free tier for some hundreds of feeds (number of users is not a factor for Go Read).

For the first few weeks, App Engine was costing me around $50/day. This was right after the HN and gizmodo posts. I got 20k users signed up in 3 days. That was around 800k feeds, and a few million new stories per day. Lots of data coming in. Even updating the feeds at 20/s wasn't enough to keep up. Today, I have a few hundred active users and probably a few thousand feeds. Costs have dropped to about $6/day. Quite manageable.

## do less things

A simple rule in computers is to make something run faster, have it do less work. I remember reading about how grep works quickly. Instead of splitting a file by lines and then searching for the string, it searches for the string, then finds the newlines on either side. Thus, if a file has no matches, it won't ever have to do the work for line splitting. Done the naive way, it would always split by line even if there was no match. Do less work.

Feed updates were happening every 6 hours for all feeds. But many feeds are updated less than once per week. The first change was to optimize how feed update times are chosen. Rarely updated feeds were checked less frequently. A slight improvement and performance and cost.

When users decide to leave Go Read, and they are the only user of a certain feed, we can detect when it is no longer being viewed. Feeds that haven't been viewed for a month are no longer updated. The data is still there. If the user returns they will resume like normal. This was the most effective cost-reduction technique we used.

## store less things

App Engine charges for data stored in its amazing datastore (my favorite feature of App Engine and the only feature I'm aware of that has zero competitors in the cloud space. When you compare to AWS prices, no one mentions the datastore.) After six months I had 500GB of data (about half of which was indexes). This was costing me about $3/day (and increasing) in just stored data (not counting access the data). Blobstore (where feed favicons and opml uploads) was in the $1/day range. Not a lot, but it adds up per day. I ran some cleanup code to delete unused blobs so I'm now under the free blobstore limit. Another large batch job deleted feed items for feeds not viewed in the last 90 days. This cleared up about 60% of the used datastore space. Overall a savings of almost $3/day. Not too interesting, but useful.

## overall expenses

Expenses now are so cheap that I expect my profits to rise even though income is not. Optimizing for use is one of the tricky parts of App Engine. But if you want to use App Engine, you have to do it [the App Engine way](http://bjk5.com/post/54202245691/the-app-engine-way).

# conclusion

Putting work into a product that is profitable is a lot of fun. I'm pleased that something I put hundreds of hours and thousands of commits into is enjoyed and used by other users. I hope that Go Read continues to be useful and valuable enough to others that they are happy to pay for it.
