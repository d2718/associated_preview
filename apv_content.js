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
// Number of milliseconds after which each type of cached resource expires.
const CACHE_AGE = {
    "article": 1000 * 3600 * 24,    // 24 hours
    "topic":   1000 * 3600 * 4,     // 4 hours
    "feed":    1000 * 3600 * 4      // 4 hours
};

// Our script waits until SCRIPT_ROOT is done before it fires.
const SCRIPT_ROOT = new RegExp("^https://apnews.com/dist/index\.js");

// Time in milliseconds to wait between checks to see if the URI has changed.
const POLL_INTERVAL = 1000;

const STORAGE = chrome.storage.local;

// Previews for different types of pages require different methods to
// extract. This Array pairs regular expressions with the functions that
// extract previews from URIs that match those regular expressions.
const URI_RE_MAP = [
    { "re": new RegExp("^https?://apnews.com/[a-z0-9]{32}($|\\?|\\/)"), "type": "article" },
    { "re": new RegExp("^https?://apnews.com/(tag\\/)?[A-Z]"), "type": "topic" },
    { "re": new RegExp("^https?://apnews.com/(tag\\/)?apf"),  "type": "feed"  }
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

/* EXTRACT_PREVIEW is a map from URI types to functions that will extract the
 * appropriate information from their DOMs and return a preview.
 */
const EXTRACT_PREVIEW = {
    "article": function(doc) {
        if(DEBUG) console.log("APV: PARSE_FOR_PREVIEW['article']() called");
        
        let title_text = undefined;
        let date_text  = "";
        let paragraphs = undefined;
        let art = doc.querySelector("article");
        if (art) {
            if(DEBUG) console.log("APV: PARSE_FOR_PREVIEW['article'](): article has <ARTICLE> tag");
            let x = art.querySelector("div[class^='headline']");
            title_text = x.textContent;
            paragraphs = art.getElementsByTagName("p");
        } else {
            let art_div = doc.querySelector("div.Article");
            if (art_div) {
                if(DEBUG) console.log("APV: PARSE_FOR_PREVIEW['article'](): article has div.Article element");
                paragraphs = art_div.getElementsByTagName("p");
                title_text = doc.querySelector("div.CardHeadline div h1").textContent;
                date_text = doc.querySelector("div.CardHeadline div span.Timestamp").textContent;
                date_text = "<p class='date'>" + date_text + "</p>";
            } else {
                if(DEBUG) console.log("APV: PARSE_FOR_PREVIEW['article'](): no recognizable article element");
                throw Error("Article has no <ARTICLE> or <DIV class='Article'> element.");
            }
        }
        
        let chunks = [];
        let i = 0;
        for (let p of paragraphs) {
            if (i == ARTICLE_PARAGRAPHS) break;
            if (NON_SPACE_RE.test(p.textContent)) {
                chunks.push(`<p>${p.textContent}</p>`);
                i++;
            }
        }
        
        return `<h3>${title_text}</h3>\n${date_text}\n${chunks.join("\n")}`;
    },
    
    "topic": function(doc) {
        if(DEBUG) console.log("APV: PARSE_FOR_PREVIEW['topic']() called");
        
        let x = doc.querySelector("h1[data-key='hub-title']");
        let topic_title = x.textContent;
        let topic_desc = "";
        if (x.nextElementSibling) {
            topic_desc = `<p>${x.nextElementSibling.textContent}</p>`;
        }
        
        let feed = doc.querySelectorAll("article div.FeedCard");
        let chunks = [];
        let i = 0;
        for (let d of feed) {
            if (i == TOPIC_HEADLINES) break;
            let headline = d.querySelector("div.CardHeadline h1");
            if (headline) {
                chunks.push(`<li>${headline.textContent}</li>`);
                i++;
            }
        }
        
        return `<h3>TOPIC: ${topic_title}</h3>\n${topic_desc}\n<ul>${chunks.join("\n")}</ul>`;
    },
    
    "feed": function(doc) {
        if(DEBUG) console.log("APV: PARSE_FOR_PREVIEW['topic']() called");
        
        let x = doc.querySelector("div.Body h1[data-key='hub-title']");
        let feed_title = x.textContent;
        
        x = doc.querySelectorAll("article div.FeedCard");
        let chunks = [];
        let i = 0;
        for (let d of x) {
            if (i == TOPIC_HEADLINES) break;
            let headline = d.querySelector("div.CardHeadline a h1");
            if (headline) {
                chunks.push(`<li>${headline.textContent}</li>`);
                i++;
            }
        }
        
        return `<h3>FEED: ${feed_title}</h3>\n<ul>${chunks.join("\n")}</ul>`;
    }
}

/* fetch_uri(a, typ) fetches the URI pointed to by <A>, parses it into a
 * DOM, then calls the appropriate function to extract the preview of
 * that resource, based on the given typ.
 * 
 * If successful, sets the preview text and caches the result; otherwise
 * sets the preview text for the given URI to PREVIEW_ERROR.
 */
function fetch_uri(a, typ) {
    if(DEBUG) console.log(`APV: fetch_uri([ link "${a.href}" ], ${typ}) called`);
    
    fetch(a.href).then(function(resp) {
        resp.text().then(function(data) {
            try {
                let doc = PARSER.parseFromString(data, "text/html");
                let prev_text = EXTRACT_PREVIEW[typ](doc);
                intralink_map[a.href] = prev_text;
                let cache_ent = {
                    "prev": prev_text,
                    "exp": Date.now() + CACHE_AGE[typ]
                };
                STORAGE.set({[a.href]: cache_ent},
                    function() {
                        let err = chrome.runtime.lastError;
                        if (err) {
                            if (DEBUG) console.log(`APV: fetch_uri([ link "${a.href}" ], ${typ}): Error caching URI: ${err}`);
                        } else {
                            console.log(`APV: fetch_uri([ link "${a.href}" ], ${typ}): URI cached successfully.`);
                        }
                    }
                );
                if(DEBUG) console.log(`APV: fetch_uri([ link "${a.href}", ${typ}) Successful`);
            } catch(err) {
                if(DEBUG) console.log(`APV: fetch_uri([ link "${a.href}", ${typ}) caught error: ${err}`);
                intralink_map[a.href] = PREVIEW_ERROR;
            }
        }).catch(function(err) {
            if(DEBUG) console.log(`APV: fetch_uri([ link "${a.href}", ${typ}): Error parsing resource text: ${err}`);
            intralink_map[a.href] = PREVIEW_ERROR;
        });
    }).catch(function(err) {
        if(DEBUG) console.log(`APV: fetch_uri([ link "${a.href}", ${typ}): Error fetching resource: ${err}`);
        intralink_map[a.href] = PREVIEW_ERROR;
    });
}

/* assign_preivew(a, typ) sets <A> tag a to display the appropriate preivew
 * when moused-over.
 *  * Add event handlers to a.
 *  * Check cache for non-expired preview and associate that if it exists,
 *    otherwise call the function to fetch and parse the appropriate URI
 *    and set the preview.
 */
function assign_preview(a, typ) {
    if(DEBUG) console.log(`APV: assign_preview([ link "${a.href}" ], ${typ}) called`);

    intralink_map[a.href] = PREVIEW_LOADING;
    a.addEventListener("mouseover", show_preview);
    a.addEventListener("mouseout",  hide_preview);
    a.addEventListener("click",     hide_preview);
    
    STORAGE.get(a.href,
        function(cached) {
            let err = chrome.runtime.lastError;
            if (err) {
                if (DEBUG) console.log(`APV: getting "${a.href}" from cache threw error: ${err}`);
                intralink_map[a.href] = PREVIEW_ERROR;
                return;
            }
            if (cached[a.href]) {
                if (DEBUG) console.log(`APV: assign_preview([ link "${a.href}" ]): found cached preview`);
                let ent = cached[a.href];
                if (Date.now() < ent.exp) {
                    console.log(`APV: assign_preview([ link "${a.href}" ]): cache unexpired; setting preview to cached value`);
                    intralink_map[a.href] = ent.prev;
                    return;
                }
            }
            if(DEBUG) console.log(`APV: assign_preview([ link "${a.href}" ]): no unexpired cached preview`);
            fetch_uri(a, typ);
        }
    );
}

/* scan_for_intralinks() searches through the "Article" <DIV> on the current
 * page for <A> elements whose .href attributes match regular expressions
 * in the URI_RE_MAP array. It then calls the appropriate functions to
 * fetch preview text and associated it with the given link elements.
 */
function scan_for_intralinks() {
    if(DEBUG) console.log("APV: scan_for_intralinks() called");
    let art_div = document.querySelector("div.Article");
    if (!art_div) {
        if(DEBUG) console.log("APV: scan_for_intralinks(): no div.Article");
        art_div = document.getElementsByTagName("article")[0];
    }
    if(art_div) { 
        for (let a of art_div.getElementsByTagName("a")) {
            for (let refp of URI_RE_MAP) {
                if (refp.re.test(a.href)) {
                    assign_preview(a, refp.type);
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
