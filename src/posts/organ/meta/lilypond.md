---
title: "LilyPond"
date: 2024-05-05
---

[LilyPond](https://lilypond.org/) describes itself as "a music engraving program, devoted to producing the highest-quality sheet music possible." It is text-based so fits into what I am used to with programming. I have used it for around 20 years. Currently it is used for the various [arranging](https://github.com/maddyblue/lilypond) that I do.

[lilypond-assist](https://github.com/maddyblue/lilypond-assist) is a VS Code extension I wrote to format and compile on save any changes to .ly files. With a PDF viewer extension in a side window, editing and seeing changes is very quick: they appear a second or so after saving in the PDF that is next to the lilypond file. This extension was adapted from various other lilypond extensions that promise these features but were broken or did not work how I wanted for some reason.

I maintain a [.devcontainer](https://github.com/maddyblue/lilypond/tree/main/.devcontainer) which allows GitHub Codespaces to run the development environment fully in the browser. This allows me to fix music bugs while seated at my organ without maintaining a local dev environment.

<video controls width="100%">
    <source src="/public/media/lilypond-assist.webm">
</video>