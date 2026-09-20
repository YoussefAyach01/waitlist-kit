/*
 * waitlist-kit widget. No dependencies, no build step.
 *
 *   <script src="https://YOUR-HOST/widget.js" data-list="LIST_ID" defer></script>
 *
 * Optional attributes: data-title, data-button, data-target (CSS selector to mount into).
 * Renders inside a shadow root so host-page CSS cannot break it, and uses textContent only.
 */
(function () {
  "use strict";

  var CSS =
    ":host{display:block;font-family:inherit;color:inherit}" +
    ".box{max-width:26rem;padding:1rem;border:1px solid #9aa7b3;border-radius:10px;background:#fff;color:#14202b}" +
    "h2{margin:0 0 .5rem;font-size:1.15rem}" +
    "label{display:block;font-weight:600;font-size:.9rem;margin-bottom:.25rem}" +
    "input{box-sizing:border-box;width:100%;min-height:44px;padding:.5rem .65rem;font:inherit;border:1px solid #5f6f7f;border-radius:6px;background:#fff;color:#14202b}" +
    "button{min-height:44px;margin-top:.6rem;padding:.5rem 1rem;font:inherit;font-weight:600;border:1px solid #0e7c6b;border-radius:6px;background:#0e7c6b;color:#fff;cursor:pointer}" +
    "button.alt{background:#fff;color:#0a5c50}" +
    "button:disabled{opacity:.7;cursor:progress}" +
    ":focus-visible{outline:3px solid #0e7c6b;outline-offset:2px}" +
    ".err{color:#a4231b;margin:.5rem 0 0}" +
    ".rank{font-size:2rem;font-weight:700;margin:.25rem 0}" +
    ".row{display:flex;gap:.5rem;align-items:flex-end;flex-wrap:wrap}.row input{flex:1 1 12rem}" +
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    "p{margin:.35rem 0}";

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function storageSet(key, val) {
    try {
      window.localStorage.setItem(key, val);
    } catch (e) {
      /* private mode: the widget still works, it just won't remember the visitor */
    }
  }

  function refFromUrl() {
    try {
      var r = new URLSearchParams(window.location.search).get("ref");
      return r && /^[a-z0-9]{6,16}$/i.test(r) ? r.toLowerCase() : null;
    } catch (e) {
      return null;
    }
  }

  function mount(host, opts) {
    var api = opts.api.replace(/\/+$/, "");
    var listId = opts.list;
    var storeKey = "waitlist-kit:" + listId;
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.appendChild(el("style", null, CSS));
    var box = el("div", { class: "box" });
    root.appendChild(box);

    function post(path, body) {
      return fetch(api + "/api/w/" + encodeURIComponent(listId) + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data && data.error ? data.error : "Something went wrong");
          return data;
        });
      });
    }

    function renderDone(s) {
      box.textContent = "";
      var h = el("h2", null, "You're on the list");
      var live = el("div", { "aria-live": "polite" });
      live.appendChild(el("p", { class: "rank" }, "#" + s.position));
      live.appendChild(
        el(
          "p",
          null,
          s.total +
            " people signed up. " +
            s.referrals +
            (s.referrals === 1 ? " friend has" : " friends have") +
            " joined with your link.",
        ),
      );
      box.appendChild(h);
      box.appendChild(live);
      box.appendChild(
        el("p", null, "Invite friends to move up. Each signup through your link raises your rank."),
      );
      var link = window.location.origin + window.location.pathname + "?ref=" + s.code;
      var row = el("div", { class: "row" });
      var wrap = el("div", { style: "flex:1 1 12rem" });
      wrap.appendChild(el("label", { for: "wk-link" }, "Your invite link"));
      var input = el("input", { id: "wk-link", readonly: "readonly", value: link });
      wrap.appendChild(input);
      row.appendChild(wrap);
      var copy = el("button", { type: "button", class: "alt" }, "Copy link");
      copy.addEventListener("click", function () {
        input.select();
        var done = function () {
          copy.textContent = "Copied";
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(done, function () {});
        } else {
          try {
            document.execCommand("copy");
            done();
          } catch (e) {
            /* user can copy manually: the field is selected */
          }
        }
      });
      row.appendChild(copy);
      box.appendChild(row);
    }

    function renderForm() {
      box.textContent = "";
      box.appendChild(el("h2", null, opts.title));
      var form = el("form", { novalidate: "novalidate" });
      form.appendChild(el("label", { for: "wk-email" }, "E-mail"));
      form.appendChild(
        el("input", {
          id: "wk-email",
          name: "email",
          type: "email",
          autocomplete: "email",
          required: "required",
          inputmode: "email",
        }),
      );
      var hp = el("div", { class: "hp", "aria-hidden": "true" });
      hp.appendChild(el("input", { name: "website", tabindex: "-1", autocomplete: "off" }));
      form.appendChild(hp);
      var btn = el("button", { type: "submit" }, opts.button);
      form.appendChild(btn);
      var err = el("p", { class: "err", role: "alert" });
      form.appendChild(err);
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        err.textContent = "";
        var data = new FormData(form);
        var email = String(data.get("email") || "").trim();
        if (!email) {
          err.textContent = "Enter your e-mail address.";
          return;
        }
        btn.disabled = true;
        post("/join", {
          email: email,
          ref: refFromUrl(),
          website: String(data.get("website") || ""),
        })
          .then(function (s) {
            storageSet(storeKey, s.code);
            renderDone(s);
          })
          .catch(function (e) {
            err.textContent = e && e.message ? e.message : "Something went wrong";
            btn.disabled = false;
          });
      });
      box.appendChild(form);
    }

    renderForm();
    var saved = storageGet(storeKey);
    if (saved) {
      fetch(
        api + "/api/w/" + encodeURIComponent(listId) + "/status?code=" + encodeURIComponent(saved),
      )
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (s) {
          if (s && s.ok) renderDone(s);
        })
        .catch(function () {});
    }
  }

  function autoMount() {
    // currentScript is null when a framework injects the tag; fall back to the tagged script.
    var script =
      document.currentScript || document.querySelector('script[data-list][src*="widget.js"]');
    if (!script) return;
    var list = script.getAttribute("data-list");
    if (!list) return;
    var target = script.getAttribute("data-target");
    var host = target ? document.querySelector(target) : null;
    if (!host) {
      host = el("div");
      script.parentNode.insertBefore(host, script);
    }
    var origin = "";
    try {
      origin = new URL(script.src).origin;
    } catch (e) {
      origin = window.location.origin;
    }
    mount(host, {
      list: list,
      api: script.getAttribute("data-api") || origin,
      title: script.getAttribute("data-title") || "Join the waitlist",
      button: script.getAttribute("data-button") || "Join waitlist",
    });
  }

  window.WaitlistKit = { mount: mount };
  autoMount();
})();
