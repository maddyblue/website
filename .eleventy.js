const { DateTime } = require("luxon");

/**
 * This is the JavaScript code that determines the config for your Eleventy site
 *
 * You can add lost of customization here to define how the site builds your content
 * Try extending it to suit your needs!
 */

module.exports = function (eleventyConfig) {
  eleventyConfig.setTemplateFormats([
    // Templates:
    "html",
    "njk",
    "md",
    // Static Assets:
    "css",
    "jpeg",
    "jpg",
    "pdf",
    "png",
    "svg",
    "woff",
    "woff2",
  ]);
  eleventyConfig.addPassthroughCopy("public");
  eleventyConfig.addPassthroughCopy(".well-known");

  // Filters let you modify the content https://www.11ty.dev/docs/filters/
  eleventyConfig.addFilter("htmlDateString", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });

  eleventyConfig.setBrowserSyncConfig({
    ghostMode: false,

    middleware: [
      function (req, res, next) {
        if (req.url.startsWith('/.well-known/')) {
          res.setHeader("Content-Type", "application/json");
        }
        next();
      },
    ],
  });

  /* Build the collection of posts to list in the site
     - Read the Next Steps post to learn how to extend this
  */
  eleventyConfig.addCollection("posts", function (collection) {
    /* The posts collection includes all posts that list 'posts' in the front matter 'tags'
       - https://www.11ty.dev/docs/collections/
    */

    const coll = collection
      .getFilteredByTag("posts")
      .sort((a, b) => b.data.date - a.data.date);

    // From: https://github.com/11ty/eleventy/issues/529#issuecomment-568257426
    // Adds {{ prevPost.url }} {{ prevPost.data.title }}, etc, to our njks templates
    for (let i = 0; i < coll.length; i++) {
      const prevPost = coll[i - 1];
      const nextPost = coll[i + 1];

      //coll[i].data["prevPost"] = prevPost;
      //coll[i].data["nextPost"] = nextPost;
    }

    return coll;
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      output: "build",
    },
  };
};
