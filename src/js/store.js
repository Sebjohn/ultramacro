/* =========================================================
   Ultra Macro — Store (état en mémoire + sélecteurs + mutations)
   La persistance est déléguée au repository actif (U.active),
   qui rappelle U.store.set() avec les données à jour → rendu.
   ========================================================= */
(function (U) {
    "use strict";

    var listeners = [];
    var store = {
        data: { poles: {}, chantiers: {} },
        ready: false
    };

    /* --------- Abonnement UI --------- */
    store.subscribe = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; };
    function emit() { listeners.forEach(function (fn) { try { fn(store.data); } catch (e) { console.error(e); } }); }

    // Appelé par le repository quand des données faisant autorité arrivent.
    store.set = function (data) {
        store.data = {
            poles: data && data.poles ? data.poles : {},
            chantiers: data && data.chantiers ? data.chantiers : {}
        };
        store.ready = true;
        emit();
    };

    /* =========================================================
       Sélecteurs
       ========================================================= */
    store.polesArray = function (sortMode) {
        var arr = Object.keys(store.data.poles).map(function (k) { return store.data.poles[k]; });
        if (sortMode === "urgent") {
            arr.sort(function (a, b) { return store.poleUrgency(a.id) - store.poleUrgency(b.id); });
        } else if (sortMode === "load") {
            arr.sort(function (a, b) { return store.poleActiveCount(b.id) - store.poleActiveCount(a.id); });
        } else {
            arr.sort(function (a, b) {
                var d = (a.order || 0) - (b.order || 0);
                return d !== 0 ? d : (a.name || "").localeCompare(b.name || "");
            });
        }
        return arr;
    };

    store.pole = function (id) { return store.data.poles[id] || null; };

    store.chantiersArray = function () {
        return Object.keys(store.data.chantiers).map(function (k) { return store.data.chantiers[k]; });
    };

    store.chantier = function (id) { return store.data.chantiers[id] || null; };

    store.chantiersOfPole = function (poleId) {
        return store.chantiersArray().filter(function (c) { return c.pole === poleId; });
    };

    store.poleActiveCount = function (poleId) {
        return store.chantiersOfPole(poleId).filter(function (c) { return c.statut !== "termine"; }).length;
    };

    // Plus petit = plus urgent (retards en premier, puis proche, sinon grand nombre).
    store.poleUrgency = function (poleId) {
        var active = store.chantiersOfPole(poleId).filter(function (c) { return c.statut !== "termine" && c.deadline; });
        if (!active.length) return 9999;
        return active.reduce(function (min, c) {
            var d = U.daysUntil(c.deadline);
            return (d !== null && d < min) ? d : min;
        }, 9999);
    };

    store.kpis = function () {
        var all = store.chantiersArray();
        return {
            total:   all.length,
            prevu:   all.filter(function (c) { return c.statut === "prevu"; }).length,
            encours: all.filter(function (c) { return c.statut === "encours"; }).length,
            termine: all.filter(function (c) { return c.statut === "termine"; }).length
        };
    };

    store.poleStats = function (poleId) {
        var list = store.chantiersOfPole(poleId);
        var byStatus = { prevu: 0, encours: 0, termine: 0 };
        var progSum = 0;
        list.forEach(function (c) {
            byStatus[c.statut] = (byStatus[c.statut] || 0) + 1;
            progSum += (c.statut === "termine") ? 100 : (Number(c.progression) || 0);
        });
        return {
            total: list.length,
            prevu: byStatus.prevu, encours: byStatus.encours, termine: byStatus.termine,
            progress: list.length ? Math.round(progSum / list.length) : 0
        };
    };

    var priorityRank = function (c) {
        var p = U.PRIORITIES[c.priorite];
        return p ? p.rank : U.PRIORITIES[U.DEFAULT_PRIORITY].rank;
    };

    // Tri "focus" : priorité, puis urgence (échéance), puis nom.
    store.sortByFocus = function (list) {
        return list.slice().sort(function (a, b) {
            var pr = priorityRank(a) - priorityRank(b);
            if (pr !== 0) return pr;
            var da = a.deadline ? U.daysUntil(a.deadline) : 99999;
            var db = b.deadline ? U.daysUntil(b.deadline) : 99999;
            if (da !== db) return da - db;
            return (a.nom || "").localeCompare(b.nom || "");
        });
    };

    // Priorités actives d'un pôle (pour la vue macro).
    store.poleFocus = function (poleId, limit) {
        var active = store.chantiersOfPole(poleId).filter(function (c) { return c.statut !== "termine"; });
        var sorted = store.sortByFocus(active);
        return limit ? sorted.slice(0, limit) : sorted;
    };

    // Échéances à venir (bandeau) — non terminées, datées, triées par date.
    store.upcomingDeadlines = function (limit) {
        var list = store.chantiersArray().filter(function (c) {
            return c.statut !== "termine" && c.deadline;
        });
        list.sort(function (a, b) { return U.daysUntil(a.deadline) - U.daysUntil(b.deadline); });
        return limit ? list.slice(0, limit) : list;
    };

    /* =========================================================
       Mutations — délèguent au repository actif (U.active).
       ========================================================= */
    function nowISO() { return new Date().toISOString(); }

    store.saveChantier = function (input) {
        var existing = input.id ? store.chantier(input.id) : null;
        var chantier = {
            id: input.id || U.uid(),
            nom: (input.nom || "").trim(),
            pole: input.pole,
            statut: U.STATUSES[input.statut] ? input.statut : "prevu",
            priorite: U.PRIORITIES[input.priorite] ? input.priorite : U.DEFAULT_PRIORITY,
            responsable: (input.responsable || "").trim() || null,
            deadline: input.deadline || null,
            progression: U.clamp(Number(input.progression) || 0, 0, 100),
            notes: (input.notes || "").trim() || null,
            createdAt: existing ? existing.createdAt : nowISO(),
            updatedAt: nowISO(),
            order: existing ? existing.order : Date.now()
        };
        if (!chantier.nom || !chantier.pole) return null;
        U.active.upsertChantier(chantier);
        return chantier;
    };

    store.setStatus = function (id, statut) {
        var c = store.chantier(id);
        if (!c || !U.STATUSES[statut]) return;
        var updated = Object.assign({}, c, { statut: statut, updatedAt: nowISO() });
        if (statut === "termine" && (!updated.progression || updated.progression < 100)) updated.progression = 100;
        U.active.upsertChantier(updated);
    };

    store.deleteChantier = function (id) { U.active.deleteChantier(id); };

    store.savePole = function (input) {
        var existing = input.id ? store.pole(input.id) : null;
        var pole = {
            id: input.id || ("pole_" + U.uid()),
            name: (input.name || "").trim(),
            icon: (input.icon || "folder").trim().replace(/^fa-/, ""),
            theme: U.THEMES[input.theme] ? input.theme : "indigo",
            order: existing ? existing.order : (store.polesArray().length)
        };
        if (!pole.name) return null;
        U.active.upsertPole(pole);
        return pole;
    };

    store.deletePole = function (id) {
        if (store.chantiersOfPole(id).length > 0) return false;
        U.active.deletePole(id);
        return true;
    };

    // Export brut de l'état courant.
    store.exportData = function () {
        return {
            app: "ultra-macro",
            version: U.SCHEMA_VERSION,
            exportedAt: nowISO(),
            poles: store.data.poles,
            chantiers: store.data.chantiers
        };
    };

    U.store = store;

})(window.Ultra);
