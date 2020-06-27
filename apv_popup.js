/* apv_popup.js
 * 
 * Associated Preview browser_action icon popup script
 * 
 * 2020-06-27
 */
 
const KILO = 1024;
const MEGA = 1024 * 1024;

let size_span = document.getElementById("size");
let clear_butt = document.getElementById("clear_cache");

function scale_size(x) {
    if (x < KILO) {
        return x.toString() + " bytes";
    } else if (x < MEGA) {
        let v = x / KILO;
        return v.toPrecision(3) + ' Kb';
    } else {
        let v = x / MEGA;
        return v.toPrecision(3) + ' Mb';
    }
}

function report_cache_size() {
    chrome.storage.local.getBytesInUse(null,
        function(biu) {
            size_span.innerHTML = scale_size(biu);
        }
    );
}

function clear_cache() {
    chrome.storage.local.clear(report_cache_size);
}

report_cache_size();
clear_butt.addEventListener("click", clear_cache);
