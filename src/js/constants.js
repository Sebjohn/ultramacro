/* =========================================================
   Ultra Macro — Constantes & helpers
   Espace de noms global partagé (aucun module ES → compatible file://).
   ========================================================= */
window.Ultra = window.Ultra || {};

(function (U) {
    "use strict";

    U.SCHEMA_VERSION = 3;

    /* --- Statuts (les clés restent stables pour la persistance) --- */
    U.STATUSES = {
        prevu:   { key: "prevu",   label: "À venir",  color: "var(--prevu)",   icon: "fa-regular fa-calendar",  order: 0 },
        encours: { key: "encours", label: "En cours", color: "var(--encours)", icon: "fa-solid fa-spinner",     order: 1 },
        termine: { key: "termine", label: "Terminé",  color: "var(--termine)", icon: "fa-solid fa-check-double", order: 2 }
    };
    U.STATUS_ORDER = ["prevu", "encours", "termine"];

    /* --- Priorités (rank : plus petit = plus prioritaire) --- */
    U.PRIORITIES = {
        haute:   { key: "haute",   label: "Haute",   color: "var(--p-haute)",   rank: 0, icon: "fa-solid fa-angles-up" },
        moyenne: { key: "moyenne", label: "Moyenne", color: "var(--p-moyenne)", rank: 1, icon: "fa-solid fa-equals" },
        basse:   { key: "basse",   label: "Basse",   color: "var(--p-basse)",   rank: 2, icon: "fa-solid fa-angle-down" }
    };
    U.PRIORITY_ORDER = ["haute", "moyenne", "basse"];
    U.DEFAULT_PRIORITY = "moyenne";

    /* --- Thèmes couleur des pôles (valeurs hex directes) --- */
    U.THEMES = {
        zinc:    "#a1a1aa",
        slate:   "#94a3b8",
        blue:    "#3b82f6",
        cyan:    "#06b6d4",
        teal:    "#14b8a6",
        emerald: "#10b981",
        violet:  "#8b5cf6",
        indigo:  "#6366f1",
        pink:    "#ec4899",
        rose:    "#f43f5e",
        red:     "#ef4444",
        orange:  "#f97316",
        amber:   "#f59e0b"
    };
    U.THEME_ORDER = ["indigo", "blue", "cyan", "teal", "emerald", "amber", "orange", "rose", "pink", "violet", "red", "slate", "zinc"];

    U.themeColor = function (name) {
        return U.THEMES[name] || U.THEMES.zinc;
    };

    /* --- Suggestions d'icônes pour le sélecteur (noms FontAwesome sans le préfixe fa-) --- */
    U.ICON_SUGGESTIONS = [
        "chess-knight", "rocket", "code", "bullseye", "chart-pie", "chart-line", "cube", "users",
        "briefcase", "flask", "gears", "lightbulb", "handshake", "bullhorn", "palette", "server",
        "shield-halved", "globe", "microchip", "book", "sack-dollar", "cart-shopping", "headset",
        "truck", "building", "scale-balanced", "pen-ruler", "heart-pulse", "leaf", "graduation-cap",
        "star", "flag", "database", "network-wired", "clipboard-check", "screwdriver-wrench"
    ];

    /* =========================================================
       Helpers génériques
       ========================================================= */
    U.uid = function () {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    };

    U.escape = function (s) {
        if (s == null) return "";
        return String(s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    };

    U.initials = function (name) {
        if (!name) return "?";
        return name.trim().split(/\s+/).map(function (n) { return n[0]; }).join("").slice(0, 2).toUpperCase();
    };

    U.clamp = function (n, min, max) { return Math.max(min, Math.min(max, n)); };

    /* --- Dates --- */
    U.todayStart = function () { var d = new Date(); d.setHours(0, 0, 0, 0); return d; };

    U.parseDate = function (str) {
        if (!str) return null;
        var d = new Date(str + "T00:00:00");
        return isNaN(d.getTime()) ? null : d;
    };

    U.toInputDate = function (d) {
        var x = d instanceof Date ? d : new Date();
        var m = String(x.getMonth() + 1).padStart(2, "0");
        var day = String(x.getDate()).padStart(2, "0");
        return x.getFullYear() + "-" + m + "-" + day;
    };

    // Nombre de jours entre aujourd'hui (00:00) et la deadline. <0 = en retard.
    U.daysUntil = function (dateStr) {
        var d = U.parseDate(dateStr);
        if (!d) return null;
        return Math.round((d.getTime() - U.todayStart().getTime()) / 86400000);
    };

    U.formatShort = function (dateStr) {
        var d = U.parseDate(dateStr);
        if (!d) return "";
        return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    };

    // Libellé relatif court : "Retard 3j", "Auj.", "Dans 5j"…
    U.relativeLabel = function (dateStr) {
        var n = U.daysUntil(dateStr);
        if (n === null) return "";
        if (n < 0) return "Retard " + Math.abs(n) + "j";
        if (n === 0) return "Auj.";
        if (n === 1) return "Demain";
        if (n <= 30) return "Dans " + n + "j";
        return U.formatShort(dateStr);
    };

    // Classe d'urgence pour un chantier non terminé : "late" | "soon" | "".
    U.urgencyClass = function (chantier) {
        if (!chantier.deadline || chantier.statut === "termine") return "";
        var n = U.daysUntil(chantier.deadline);
        if (n === null) return "";
        if (n < 0) return "late";
        if (n <= 3) return "soon";
        return "";
    };

    U.debounce = function (fn, wait) {
        var t;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(ctx, args); }, wait);
        };
    };

})(window.Ultra);
