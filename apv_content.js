/* apv_content.js
 * 
 * Associated Preview content script
 * Run on pages at apnews.com
 * 
 * 2020-06-20
 */

const DEBUG = true;

// Number of paragraphs to display for article previews.
const ARTICLE_PARAGRAPHS = 2;
// Number of topic headlines to load for topic previews.
const TOPIC_HEADLINES = 5;

// Our script waits until SCRIPT_ROOT is done before it fires.
const SCRIPT_ROOT = new RegExp("^https://apnews.com/dist/index\.js");

// Time in milliseconds to wait between checks to see if the URI has changed.
const POLL_INTERVAL = 1000;

// Previews for different types of pages require different methods to
// extract. This Array pairs regular expressions with the functions that
// extract previews from URIs that match those regular expressions.
const URI_RE_MAP = [
    { "re": new RegExp("^https?://apnews.com/[a-z0-9]{32}($|\\?|\\/)"), "func": fetch_article_preview },
    { "re": new RegExp("^https?://apnews.com/(tag\\/)?[A-Z]"), "func": fetch_topic_preview },
    { "re": new RegExp("^https?://apnews.com/(tag\\/)?apf-"),  "func": fetch_apf_preview   }
];
// The text of all previews is initially set to this while waiting for the
// actual preview text to fetch (or an error to occur).
const PREVIEW_LOADING = "<h3>Loading...</h3><p>The preview for this link is still loading.</p>";
// If an error occurs while fetching an article's preview, the preview text
// is set to this.
const PREVIEW_ERROR = "<h3>Error</h3><p>There was an error loading the preview for this link.</p>";

// Matches any non-whitespace character.
const NON_SPACE_RE = new RegExp("\\S");

// Parses the fetch articles to extract elements for their previews. We only
// need a single instance of this objext.
const PARSER = new DOMParser();
// Mathces link URIs (a tag object .href properties) to preview texts.
// Will be set to an actual object value when the script starts actually
// doing stuff.
let intralink_map = null;
// The page element where previews will be displayed.
let preview_div   = null;

/* debug_dump() is a debugging function that spits out its arguments
 * properties and functions to the console in a particular way.
 */
function debug_dump(obj) {
    let eltz    = [];
    let empties = [];
    let funx    = [];
    for(let k in obj) {
        let v = obj[k];
        if (v === null) empties.push(k);
        else if(v == "") empties.push(k);
        else if(typeof(v) == "function") funx.push(k);
        else eltz.push(`${k}: <${typeof(v)}> ${String(v)}`);
    }
    let output = [
        `<${typeof(obj)}> ${String(obj)}\n\t`,
        eltz.join("\n\t"),
        "\n\tfunctions:\n\t",
        funx.join(', '),
        "\n\tempties:\n\t",
        empties.join(", ")
    ]
    
    console.log(output.join(""));
}

/* fire_on_page_load() takes a callback to be executed either when the page
 * is loaded, or the call to fire_on_page_load() occurs, whichever is later.
 * 
 * This is used to ensure that the script's functionality isn't started
 * (or restarted) before the page (or new page) is fully loaded.
 */
function fire_on_page_load(f) {
    if(DEBUG) console.log(`AVP: fire_on_page_load(): document is "${document.readyState}"`);
    switch (document.readyState) {
        case "uninitialized":
        case "loading":
            document.addEventListener("load", f);
            if(DEBUG) console.log(`AVP: fire_on_page_load(): added listener`);
            break;
        default:
            f();
            if(DEBUG) console.log(`AVP: fire_on_page_load(): executed function`);
    }
}

/* get_index_script() retrieves the script element whose URI matches the
 * SCRIPT_ROOT regex.
 */
function get_index_script() {
    let skripz = document.getElementsByTagName("script");
    for(let s of skripz) {
        if (SCRIPT_ROOT.test(s.src)) return s;
    }
}

/* parse_wirestory_article() parses the DOM of an article resource
 * WITHOUT an <article> tag to generate a preview.
 */
function parse_wirestory_article(doc) {
    if(DEBUG) console.log("APV: parse_wirestory_article() called");
    let x = doc.querySelector("div.CardHeadline div h1");
    let title_text = x.textContent;
    
    x = doc.querySelector("div.Article").getElementsByTagName("p");
    let i = 0;
    let chunks = [];
    for(let p of x) {
        if (i == ARTICLE_PARAGRAPHS) break;
        if (NON_SPACE_RE.test(p.textContent)) {
            chunks.push(`<p>${p.textContent}</p>`);
            i++;
        }
    }
    
    return `<h3>${title_text}</h3>\n${chunks.join("\n")}`;
}

/* parse_article_article() parses the <article> element of an article
 * resource that DOES (obviously) have an <article> element in order to
 * generate a preview.
 */
function parse_article_article(art) {
    if(DEBUG) console.log("APV: parse_article_article() called");
    let x = art.querySelector("div[class^='headline']");
    let title_text = x.textContent;
    
    x = art.getElementsByTagName("p");
    let i = 0;
    let chunks = [];
    for(let p of x) {
        if (i == ARTICLE_PARAGRAPHS) break;
        if (NON_SPACE_RE.test(p.textContent)) {
            chunks.push(`<p>${p.textContent}</p>`);
            i++;
        }
    }
    
    return `<h3>${title_text}</h3>\n${chunks.join("\n")}`;
}

/* fetch_article_preview(a) fetches the article to generate the preview
 * text for the supplied <A> element and adds the appropriate event handlers
 * to display it (but in the opposite order).
 */
function fetch_article_preview(a) {
    if(DEBUG) console.log(`APV: fetch_article_preview([ link "${a.href}" ]) called`);
    
    intralink_map[a.href] = PREVIEW_LOADING;
    a.addEventListener("mouseover", show_preview);
    a.addEventListener("mouseout",  hide_preview);
    a.addEventListener("click",     hide_preview);
    
    fetch(a.href).then(function (r) {
        r.text().then(function(data) {
            try {
                let doc = PARSER.parseFromString(data, "text/html");
                let art = doc.getElementsByTagName("Article")[0];
                if (art) {
                    intralink_map[a.href] = parse_article_article(art);
                } else {
                    intralink_map[a.href] = parse_wirestory_article(doc);
                }
                if(DEBUG) console.log(`APV: fetch_article_preview([ link "${a.href}"]) successful`);
                return;
            } catch(err) {
                if(DEBUG) console.log(`APV: fetch_article_preview([ link "${a.href}"]) err'd: ${err}`);
                intralink_map[a.href] = PREVIEW_ERROR;
            }
        }).catch(function(err) {
            if(DEBUG) console.log(`APV: fetch_article_preview([ link "${a.href}"]): Error parsing resource text: ${err}`);
            intralink_map[a.href] = PREVIEW_ERROR;
        });
    }).catch(function(err) {
        if(DEBUG) console.log(`APV: fetch_article_preview([ link "${a.href}"]): Error fetching resource: ${err}`);
        intralink_map[a.href] = PREVIEW_ERROR
    });
}

/* fetch_topic_preview(a) like fetch_article_preview above, but for
 * "Topic" pages.
 */
function fetch_topic_preview(a) {
    if(DEBUG) console.log(`APV: fetch_topic_preview([ link "${a.href} ]" called`);
    
    intralink_map[a.href] = PREVIEW_LOADING;
    a.addEventListener("mouseover", show_preview);
    a.addEventListener("mouseout",  hide_preview);
    a.addEventListener("click",     hide_preview);
    
    fetch(a.href).then(function(r) {
        r.text().then(function(data) {
            try {
                let doc = PARSER.parseFromString(data, "text/html");
                let x = doc.querySelector("h1[data-key='hub-title']");
                let topic_title = x.textContent;
                x = x.nextElementSibling;
                let topic_desc = x.textContent;
                
                let art_elt = doc.getElementsByTagName("article")[0];
                let feed = art_elt.querySelectorAll("div.FeedCard");
                let i = 0;
                let chunks = []
                for (let summary of feed) {
                    if (i == TOPIC_HEADLINES) { break; }
                    let headline = summary.querySelector("div.CardHeadline h1");
                    if (headline) {
                        chunks.push(`<li>${headline.textContent}</li>`);
                        i++;
                    }
                }
                
                let preview_text = `<h3>Topic: ${topic_title}</h3>\n<p>${topic_desc}</p>\n<ul>${chunks.join("\n")}</ul>`;
                intralink_map[a.href] = preview_text;
                if(DEBUG) console.log(`APV: fetch_topic_preview([ link "${a.href} ]) successful`);
            } catch(err) {
                if(DEBUG) console.log(`APV: fetch_topic_preview([ link "${a.href} ]) err'd: ${err}`);
                intralink_map[a.href] = PREVIEW_ERROR;
            }
        }).catch(function(err) {
            if(DEBUG) console.log(`APV: fetch_topic_preview([ link "${a.href} ]): Error parsing resource text: ${err}`);
            intralink_map[a.href] = PREVIEW_ERROR;
        });
    }).catch(function(err) {
        if(DEBUG) console.log(`APV: fetch_topic_preview([ link "${a.href} ]): Error fetching resource: ${err}`);
        intralink_map[a.href] = PREVIEW_ERROR;
    });
}

/* fetch_apf_preview(a) like fetch_article_preview() above, but for
 * apf- "feed" pages.
 */
function fetch_apf_preview(a) {
    if (DEBUG) console.log(`APV: fetch_apf_preview([ link "${a.href}" ]) called:`);

    intralink_map[a.href] = PREVIEW_LOADING;
    a.addEventListener("mouseover", show_preview);
    a.addEventListener("mouseout",  hide_preview);
    a.addEventListener("click",     hide_preview);

    fetch(a.href).then(function(r) {
        r.text().then(function(data) {
            try {
                let doc = PARSER.parseFromString(data, "text/html");
                let x = doc.querySelector("div.Body h1[data-key='hub-title']");
                let topic_title = x.textContent;
                
                x = doc.querySelectorAll("article div.FeedCard");
                let i = 0;
                let chunks = [];
                for(let summary of x) {
                    if (i == TOPIC_HEADLINES) { break; }
                    let headline = summary.querySelector("div.CardHeadline a h1");
                    if (headline) {
                        chunks.push(`<li>${headline.textContent}</li>`);
                        i++;
                    }
                }
                
                let preview_text = `<h3>Feed: ${topic_title}</h3>\n<ul>${chunks.join("\n")}</ul>`;
                intralink_map[a.href] = preview_text;
                if(DEBUG) console.log(`APV: fetch_apf_preview([ link "${a.href} ]) successful`);
            } catch(err) {
                if(DEBUG) console.log(`APV: fetch_apf_preview([ link "${a.href} ]) err'd: ${err}`);
                intralink_map[a.href] = PREVIEW_ERROR;
            }
        }).catch(function(err) {
            if(DEBUG) console.log(`APV: fetch_apf_preview([ link "${a.href} ]): Error parsing resource text: ${err}`);
            intralink_map[a.href] = PREVIEW_ERROR;
        });
    }).catch(function(err) {
        if(DEBUG) console.log(`APV: fetch_apf_preview([ link "${a.href} ]): Error fetching resource: ${err}`);
        intralink_map[a.href] = PREVIEW_ERROR;
    });
}
                

/* scan_for_intralinks() searches through the "Article" <DIV> on the current
 * page for <A> elements whose .href attributes match regular expressions
 * in the URI_RE_MAP array. It then calls the appropriate functions to
 * fetch preview text and associated it with the given link elements.
 */
function scan_for_intralinks() {
    if(DEBUG) console.log("APV: scan_for_intralinks() called");
    let art_div = document.getElementsByClassName("Article")[0];
    if (!art_div) {
        if(DEBUG) console.log("APV: scan_for_intralinks(): no div.Article");
        art_div = document.getElementsByTagName("article")[0];
    }
    if(art_div) { 
        for (let a of art_div.getElementsByTagName("a")) {
            for (let refp of URI_RE_MAP) {
                if (refp.re.test(a.href)) {
                    refp.func(a);
                    break;
                }
            }
        }
    } else if(DEBUG) {
        console.log("APV: scan_for_intralinks(): no div.Article or <article>");
    }
    if(DEBUG) console.log(`APV: scan_for_intralinks() returns`);
}

/* show_preview() sets the appropriate preview text and makes the preview
 * <DIV> visible. It gleans the correct link element from the mouseover
 * event it is passed by the event listener.
 */
function show_preview(evt) {
    let targ = evt.target;
    if(DEBUG) console.log(`APV: show_preview([ event points to "${targ.href}" ]) called`);
    let prev_text = intralink_map[targ.href];
    if (prev_text) {
        if (evt.clientX/window.innerWidth < 0.5) {
            preview_div.style.left = "auto";
            preview_div.style.right = "1em";
        } else {
            preview_div.style.left = "1em";
            preview_div.style.right = "auto";
        }
        if (evt.clientY/window.innerHeight < 0.5) {
            preview_div.style.top = "auto";
            preview_div.style.bottom = "1em";
        } else {
            preview_div.style.top = "1em";
            preview_div.style.bottom = "auto";
        }
        preview_div.innerHTML = prev_text;
        preview_div.style.display = "inline-block";
    }
}

/* hide_preview() makes the preview <DIV> invisible
 */
function hide_preview() { 
    if(DEBUG) console.log("APV: hide_preview() called");
    preview_div.style.display = "none";
}

/* process_page() gets things going for when a new (or the first) AP News
 * page loads. It initializes the intralink_map and initiates the scan
 * for intralinks.
 */
function process_page() {
    if(DEBUG) console.log("APV: process_page() called");
    intralink_map = {};
    
    scan_for_intralinks();

    if(DEBUG) console.log("APV: process_page() returns");
}

/* Here we wait for the SCRIPT_ROOT to stop, then create the preview <DIV>,
 * start processing the page (if appropriate), and set up a busy-wait poll
 * to start processing again if the location changes.
 */
fire_on_page_load(function() {
    if(DEBUG) console.log("APV: script detects page has loaded.");
    let idx_s = get_index_script();
    if(DEBUG) console.log(`APV: retrieved index script element: "${idx_s.src}"`);
    idx_s.addEventListener("load", function() {
        console.log("APV: index script has stopped");
        
        preview_div = document.createElement("div");
        preview_div.id = "apv_preview";
        document.body.appendChild(preview_div);
        
        if (location.href != "https://apnews.com/") process_page();
        
        /* Clicking on links inside the "Article" <DIV> somehow change the
         * current location and the URI in the bar without firing a
         * "popstate" event, so we just go the old-fashioned way and
         * busy-wait poll for it. */
        let current_href = location.href;
        setInterval(function() {
            if (current_href != location.href) {
                if(DEBUG) console.log(`APV: location change ${current_href} -> ${location.href}`);
                current_href = location.href;
                fire_on_page_load(process_page);
            }
        }, POLL_INTERVAL);
    });
});

if(DEBUG) console.log("APV: Script has reached end.");
