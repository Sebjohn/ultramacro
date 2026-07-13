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
    var TARGETS = { pole: "view-pole", kanban: "view-kanban", calendar: "view-calendar", dashboard: "view-dashboard" };

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
        document.querySelectorAll(".main-nav .nav-pill").forEach(function (b) {
            var isActive = b.dataset.nav === view
                || (b.dataset.nav === "dashboard" && view === "pole");
            b.classList.toggle("is-active", isActive);
        });

        U.views.render();
        $("appMain").scrollTop = 0;
    };

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
                else if (a === "open-settings") U.ui.openSettings();
            });
        });

        // Recherche
        var search = $("globalSearch");
        var onSearch = U.debounce(function () { U.viewState.search = search.value.trim(); U.views.render(); }, 160);
        search.addEventListener("input", onSearch);

        // Tri des pôles
        $("poleSort").addEventListener("click", function (e) {
            var b = e.target.closest(".seg-btn"); if (!b) return;
            U.viewState.poleSort = b.dataset.sort;
            $("poleSort").querySelectorAll(".seg-btn").forEach(function (x) { x.classList.toggle("is-active", x === b); });
            U.views.renderDashboard();
        });

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
            if (e.key === "/" && !typing) { e.preventDefault(); search.focus(); }
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

        // Re-rendu à chaque changement de données (local ou temps réel Firestore).
        U.store.subscribe(function () { U.views.render(); });

        // Active le repository (cloud si configuré, sinon local).
        U.persistence.init();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();

})(window.Ultra);
