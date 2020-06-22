# associated_preview
Display previews of internally-linked articles on the
[AP News website](https://apnews.com/).

This Chrome extension displays pop-up previews when links between articles
on the apnews.com domain are moused-over. This is useful because article
pathnames on the AP News website are strings of alphanumeric gibberish,
offering no clue as to the subject of a linked article. Furthermore,
link text tends to be something like, "After the
[events of last week](http://not_really_a.link), authorities are concerned
about the probability of a recurrence." which also provides very little
information.

The inspiration for this is the pop-up mouseover previews that
[Wikipedia](https://www.wikipedia.org/) displays on wikilinks.

### Installation

After downloading or cloning the repository, flip the switch in the
upper-right-hand corner of the `chrome://extensions` page to enable Developer
Mode. Click "Load unpacked" and choose the directory containing this repo.

### Technical Details / Apologies

AP News serves pages in several different formats; as of 2020-06-22,
`associated_preview` recognizes two different kinds of pages on which it
scans for interlinks, and three different kids of pages for which it will
generate previews. The logic for differentiating
between them and extracting the previews is brittle and will almost certainly
fail if AP News starts changing the format of what it serves. Please, if
something doesn't seem to be working, file a bug report or whatever.

`associated_preview`'s focus is opaque interlinks in article text. It does
not fetch or display previews for links on the front page
([apnews.com](https://apnews.com/)), lists of articles on "topic" pages
(e.g.: [apnews.com/VirusOutbreak](https://apnews.com/VirusOutbreak)),
unrelated links inserted between paragraphs of article text,
or article links appearing below the article text in the
"sponsored links" section. Links in these cases have at least their full
headlines written out, and often include a picture or some article text
as well, providing a little more of a clue about the content of the
target article. Also, limiting the number of previews fetched per page
makes the extension both faster to run and a more polite netizen.
