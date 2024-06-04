const { DateTime } = require("luxon");

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

  eleventyConfig.addFilter("htmlDateString", (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy-LL-dd");
  });

  eleventyConfig.addCollection("sections", function (collection) {
    const sections = new Map();
    collection.getAll().forEach((item) => {
      if (!item.data.section || !item.data.subsection) {
        return;
      }
      if (!sections.has(item.data.section)) {
        sections.set(item.data.section, new Map());
      }
      const section = sections.get(item.data.section);
      if (!section.has(item.data.subsection)) {
        section.set(item.data.subsection, []);
      }
      const subsection = section.get(item.data.subsection);
      if (!item.data.article) {
        item.data.article = item.data.title;
      }
      subsection.push(item);
      subsection.sort((a, b) => a.data.article.localeCompare(b.data.article));
    });
    return new Map([...sections.entries()].sort());
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      output: "build",
    },
  };
};
