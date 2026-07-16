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
        calFilter: "all",
        // Daily tasks
        dailyHideDone: false,
        collapsedSections: {},
        editingSection: null,
        _focusAddSid: undefined
    };

    /* --------- Navigation --------- */
    var TARGETS = { pole: "view-pole", kanban: "view-kanban", mindmap: "view-mindmap", calendar: "view-calendar", daily: "view-daily", dashboard: "view-dashboard" };
    // Vues regroupées sous le menu « Autres ».
    var MORE_VIEWS = { kanban: 1, mindmap: 1, daily: 1 };

    U.nav = function (view, param) {
        if (view === "pole") {
            if (!param || !U.store.pole(param)) { view = "dashboard"; }
            else U.viewState.pole = param;
        }
        if (view !== "pole") U.viewState.pole = null;
        U.viewState.current = view;

        document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("is-active"); });
        $(TARGETS[view] || "view-dashboard").classList.add("is-active");

        // Onglets directs : "Vue d'ensemble" reste actif quand on descend dans un pôle.
        document.querySelectorAll(".main-nav .nav-pill[data-nav], .mobile-tabbar .tab[data-nav]").forEach(function (b) {
            var isActive = b.dataset.nav === view
                || (b.dataset.nav === "dashboard" && view === "pole");
            b.classList.toggle("is-active", isActive);
        });
        // Bouton "Autres" actif quand on est sur une de ses sous-vues.
        var moreActive = !!MORE_VIEWS[view];
        document.querySelectorAll("[data-more]").forEach(function (b) { b.classList.toggle("is-active", moreActive); });
        document.querySelectorAll("#moreMenu .nav-menu-item").forEach(function (b) { b.classList.toggle("is-current", b.dataset.nav === view); });
        if (U._closeMore) U._closeMore();

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

        // Filtre calendrier
        $("calFilter").addEventListener("click", function (e) {
            var b = e.target.closest(".seg-btn"); if (!b) return;
            U.viewState.calFilter = b.dataset.cal;
            $("calFilter").querySelectorAll(".seg-btn").forEach(function (x) { x.classList.toggle("is-active", x === b); });
            U.views.renderTimeline();
        });

        // Menu « Autres » (popover partagé desktop / feuille mobile)
        var moreMenu = $("moreMenu");
        function moreOpen() { return !moreMenu.hidden; }
        function positionMore() {
            if (window.innerWidth <= 640) {
                moreMenu.classList.add("as-sheet");
                moreMenu.style.top = ""; moreMenu.style.left = ""; moreMenu.style.right = "";
                return;
            }
            moreMenu.classList.remove("as-sheet");
            var btn = $("moreBtn"); if (!btn) return;
            var r = btn.getBoundingClientRect();
            moreMenu.style.top = (r.bottom + 6) + "px";
            moreMenu.style.left = Math.max(8, r.left) + "px";
            moreMenu.style.right = "auto";
        }
        function setMoreExpanded(v) { var mb = $("moreBtn"); if (mb) mb.setAttribute("aria-expanded", v ? "true" : "false"); }
        function openMore() { positionMore(); moreMenu.hidden = false; document.body.classList.add("more-open"); setMoreExpanded(true); }
        function closeMore() { moreMenu.hidden = true; document.body.classList.remove("more-open"); setMoreExpanded(false); }
        U._closeMore = closeMore;
        document.querySelectorAll("[data-more]").forEach(function (b) {
            b.addEventListener("click", function (e) { e.stopPropagation(); moreOpen() ? closeMore() : openMore(); });
        });
        document.addEventListener("click", function (e) {
            if (!moreOpen()) return;
            if (e.target.closest("#moreMenu") || e.target.closest("[data-more]")) return;
            closeMore();
        });
        window.addEventListener("resize", function () { if (moreOpen()) closeMore(); });

        // Daily tasks : ajouter une section, masquer les tâches terminées
        var addSec = $("dailyAddSection");
        if (addSec) addSec.addEventListener("click", function () {
            var sec = U.store.saveDailySection({ name: "Nouvelle section" });
            if (sec) { U.viewState.editingSection = sec.id; U.views.renderDaily(); }
        });
        var hideDone = $("dailyHideDone");
        if (hideDone) hideDone.addEventListener("change", function () {
            U.viewState.dailyHideDone = hideDone.checked;
            U.views.renderDaily();
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
