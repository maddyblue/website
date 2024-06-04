---
title: "hots.dog"
date: 2019-01-05
---

[hots.dog](https://github.com/maddyblue/hots.dog/) was a [Heroes of the Storm](https://heroesofthestorm.blizzard.com/en-us/) online stats aggregator.

It used community-sourced game uploads, processed them into a database, and allowed for pleasant viewing of cohort summaries.
I shut it down when Blizzard ended the eSports support of the game because I stopped playing at that time, and I chose not to continue running a site that did not benefit me.

### Innovations

The primary motivation for me was I didn't like the existing stats site HOTSlogs, and thought I could make a better experience.

#### Table Sorting

I wanted excellent table sorting.
When viewing stats on these sites you click around a bunch of tables.
I made a [react table sorter](https://github.com/maddyblue/hots.dog/blob/master/frontend/src/SortedTable.js) that: 
- remembers your most recent column sort preference so on next load it's still there
- sorts all similar tables the same (you click a column on one table and it updates all the other similar tables with the same sort, works across pages too)
- can configure sort direction on first click (i.e., first click on a name column should sort a -> z, first click on most number columns sort highest to lowest)

#### Game Parsing

I wrote a Go [program](https://github.com/maddyblue/hots.dog/tree/master/casc) that would read out the on-disk game files and extract images and talent text that I could dump into the database.
No tedious manual text entry.
It included an expression evaluator for the internal equations that calculate how talents change over levels.
