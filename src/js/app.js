/* =========================================================
   Ultra Macro — Bootstrap, navigation & câblage global
   ========================================================= */
(function (U) {
    "use strict";

    function $(id) { return document.getElementById(id); }

    U.viewState = {
        current: "dashboard",
        pole: null,
        search: "",
        poleSort: "manual",
        calFilter: "all"
    };

    /* --------- Navigation --------- */
    var TARGETS = { pole: "view-pole", kanban: "view-kanban", mindmap: "view-mindmap", calendar: "view-calendar", dashboard: "view-dashboard" };

    U.nav = function (view, param) {
        if (view === "pole") {
            if (!param || !U.store.pole(param)) { view = "dashboard"; }
            else U.viewState.pole = param;
        }
        if (view !== "pole") U.viewState.pole = null;
        U.viewState.current = view;

        document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("is-active"); });
        $(TARGETS[view] || "view-dashboard").classList.add("is-active");

        // Onglets : "Vue d'ensemble" reste actif quand on descend dans un pôle.
        document.querySelectorAll(".main-nav .nav-pill, .mobile-tabbar .tab[data-nav]").forEach(function (b) {
            var isActive = b.dataset.nav === view
                || (b.dataset.nav === "dashboard" && view === "pole");
            b.classList.toggle("is-active", isActive);
        });

        document.body.classList.remove("search-active"); // referme la recherche mobile
        U.views.render();
        $("appMain").scrollTop = 0;
    };

    /* --------- Thème clair / sombre --------- */
    var THEME_KEY = "ultra_macro_theme";
    function applyTheme(t) {
        document.documentElement.setAttribute("data-theme", t);
        var icon = document.querySelector("#themeToggle i");
        if (icon) icon.className = t === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
        var tt = $("themeToggle"); if (tt) tt.title = t === "dark" ? "Passer en clair" : "Passer en sombre";
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", t === "dark" ? "#14100B" : "#F3EEE4");
    }
    function toggleTheme() {
        var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
        applyTheme(next);
    }

    /* --------- Câblage --------- */
    function wire() {
        // Boutons de navigation (marque, onglets, retour)
        document.querySelectorAll("[data-nav]").forEach(function (b) {
            b.addEventListener("click", function () { U.nav(b.dataset.nav); });
            if (b.classList.contains("brand")) {
                b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); U.nav("dashboard"); } });
            }
        });

        // Actions globales
        document.querySelectorAll('[data-action]').forEach(function (b) {
            b.addEventListener("click", function () {
                var a = b.dataset.action;
                if (a === "new-chantier") U.ui.openChantier();
                else if (a === "new-pole") U.ui.openPole();
                else if (a === "new-objective") U.ui.openObjective();
                else if (a === "open-settings") U.ui.openSettings();
                else if (a === "toggle-theme") toggleTheme();
                else if (a === "toggle-search") {
                    var open = document.body.classList.toggle("search-active");
                    if (open) setTimeout(function () { $("globalSearch").focus(); }, 60);
                }
            });
        });

        // Recherche
        var search = $("globalSearch");
        var onSearch = U.debounce(function () { U.viewState.search = search.value.trim(); U.views.render(); }, 160);
        search.addEventListener("input", onSearch);

        // Tri des pôles
        // Filtre calendrier
        $("calFilter").addEventListener("click", function (e) {
            var b = e.target.closest(".seg-btn"); if (!b) return;
            U.viewState.calFilter = b.dataset.cal;
            $("calFilter").querySelectorAll(".seg-btn").forEach(function (x) { x.classList.toggle("is-active", x === b); });
            U.views.renderTimeline();
        });

        // Raccourcis clavier
        document.addEventListener("keydown", function (e) {
            var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
            if (e.key === "Escape" && document.body.classList.contains("search-active")) { document.body.classList.remove("search-active"); return; }
            if (e.key === "/" && !typing) { e.preventDefault(); document.body.classList.add("search-active"); search.focus(); }
            else if ((e.key === "n" || e.key === "N") && !typing && !e.ctrlKey && !e.metaKey) {
                var open = document.querySelector(".modal-backdrop:not([hidden])");
                if (!open) { e.preventDefault(); U.ui.openChantier(); }
            }
        });
    }

    /* --------- Démarrage --------- */
    function boot() {
        U.ui.init();
        U.views.init();
        wire();
        // Synchronise l'icône/meta avec le thème déjà posé par le script du <head>.
        applyTheme(document.documentElement.getAttribute("data-theme") || "light");

        // Re-rendu à chaque changement de données (local ou temps réel Realtime Database).
        U.store.subscribe(function () { U.views.render(); });

        // Connexion automatique à la base (cloud) ; repli local si injoignable.
        U.persistence.init().then(function () {
            // Avertissement seulement si on est resté en LOCAL et en mode fichier (file://),
            // car là le navigateur peut ne pas conserver le stockage local. Si le cloud a pris
            // le relais, les données sont persistantes → pas d'avertissement.
            if (location.protocol === "file:" && U.persistence.mode === "local") {
                setTimeout(function () {
                    U.ui.toast("Mode fichier local sans cloud : la sauvegarde peut être effacée. Publiez les règles Firebase (connexion auto) ou exportez régulièrement.", "error");
                }, 900);
            }
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();

})(window.Ultra);
