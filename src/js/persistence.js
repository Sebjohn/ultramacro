/* =========================================================
   Ultra Macro — Couche de persistance
   Deux repositories interchangeables, même contrat :
     start(), upsertPole/deletePole, upsertChantier/deleteChantier,
     bulkReplace(data), stop().
   Chaque changement appelle U.store.set(data) → rendu.

   Objectif "aucun bug de sauvegarde" :
   - écritures par entité (jamais d'écrasement global) ;
   - Firestore en temps réel + persistance hors-ligne ;
   - repli localStorage transparent si Firebase n'est pas configuré.
   ========================================================= */
(function (U) {
    "use strict";

    var FB_VERSION = "10.12.5";
    var LS = {
        DATA: "ultra_macro_data_v3",
        CFG: "ultra_macro_fb_config",
        WS: "ultra_macro_fb_workspace",
        LEGACY_POLES: "ultra_macro_poles",
        LEGACY_CHANT: "ultra_macro_chantiers"
    };

    /* ------------------------------------------------------------------ */
    /*  Données par défaut (premier lancement)                            */
    /* ------------------------------------------------------------------ */
    function seed() {
        var t = new Date();
        function rel(days) { var d = new Date(t); d.setDate(d.getDate() + days); return U.toInputDate(d); }
        var poles = {
            direction:  { id: "direction",  name: "Direction & Stratégie", icon: "chess-knight", theme: "indigo",  order: 0, defaultResponsable: "Sébastien" },
            rd:         { id: "rd",          name: "R&D & Tech",            icon: "code",         theme: "blue",    order: 1, defaultResponsable: "Luc M." },
            marketing:  { id: "marketing",   name: "Marketing & Growth",    icon: "bullseye",     theme: "pink",    order: 2, defaultResponsable: "Julie R." },
            sales:      { id: "sales",       name: "Commercial & Ventes",   icon: "chart-pie",    theme: "emerald", order: 3, defaultResponsable: "Marc" },
            operations: { id: "operations",  name: "Opérations & Supply",   icon: "cube",         theme: "amber",   order: 4, defaultResponsable: "Nadia" },
            rh:         { id: "rh",          name: "Ressources Humaines",   icon: "users",        theme: "cyan",    order: 5, defaultResponsable: "People" }
        };
        var raw = [
            { nom: "Alignement Vision 2030",      pole: "direction",  statut: "encours", priorite: "haute",   responsable: "Sébastien",  deadline: rel(9),   progression: 40 },
            { nom: "Levée de fonds série A",      pole: "direction",  statut: "prevu",   priorite: "haute",   responsable: "CFO",        deadline: rel(28),  progression: 0 },
            { nom: "Architecture Core API v3",    pole: "rd",         statut: "encours", priorite: "haute",   responsable: "Luc M.",     deadline: rel(-2),  progression: 65 },
            { nom: "Migration CI/CD",             pole: "rd",         statut: "prevu",   priorite: "moyenne", responsable: "Ops Team",   deadline: rel(14),  progression: 0 },
            { nom: "Refonte du site vitrine",     pole: "marketing",  statut: "termine", priorite: "moyenne", responsable: "Design",     deadline: rel(-20), progression: 100 },
            { nom: "Campagne acquisition Q3",     pole: "marketing",  statut: "encours", priorite: "moyenne", responsable: "Julie R.",   deadline: rel(3),   progression: 30 },
            { nom: "Lancement marché DACH",       pole: "sales",      statut: "encours", priorite: "haute",   responsable: "Marc",       deadline: rel(1),   progression: 55 },
            { nom: "Playbook de vente",           pole: "sales",      statut: "prevu",   priorite: "basse",   responsable: null,         deadline: null,     progression: 0 },
            { nom: "Optimisation logistique",     pole: "operations", statut: "encours", priorite: "moyenne", responsable: "Nadia",      deadline: rel(6),   progression: 45 },
            { nom: "Plan de recrutement H2",      pole: "rh",         statut: "prevu",   priorite: "moyenne", responsable: "People",     deadline: rel(18),  progression: 0 }
        ];
        var chantiers = {};
        raw.forEach(function (c, i) { c.order = i; var id = U.uid(); chantiers[id] = normChantier(Object.assign({ id: id }, c), i); });
        return { poles: poles, chantiers: chantiers };
    }

    /* ------------------------------------------------------------------ */
    /*  Normalisation / migration                                         */
    /* ------------------------------------------------------------------ */
    function normChantier(c, i) {
        var id = String(c.id != null ? c.id : U.uid());
        var now = new Date().toISOString();
        return {
            id: id,
            nom: (c.nom || c.name || "Sans nom").toString(),
            pole: c.pole || null,
            statut: U.STATUSES[c.statut] ? c.statut : "prevu",
            priorite: U.PRIORITIES[c.priorite] ? c.priorite : U.DEFAULT_PRIORITY,
            responsable: c.responsable || null,
            deadline: c.deadline || null,
            progression: U.clamp(Number(c.progression) || 0, 0, 100),
            notes: c.notes || null,
            createdAt: c.createdAt || now,
            updatedAt: c.updatedAt || now,
            order: (typeof c.order === "number") ? c.order : (i || 0)
        };
    }

    function normalize(raw) {
        raw = raw || {};
        var out = { poles: {}, chantiers: {} };

        var poles = raw.poles || {};
        Object.keys(poles).forEach(function (k, i) {
            var p = poles[k] || {};
            var id = p.id || k;
            out.poles[id] = {
                id: id,
                name: p.name || k,
                icon: (p.icon || "folder").toString().replace(/^fa-/, ""),
                theme: U.THEMES[p.theme] ? p.theme : "indigo",
                defaultResponsable: p.defaultResponsable || null,
                order: (typeof p.order === "number") ? p.order : i
            };
        });

        var ch = raw.chantiers || {};
        var list = Array.isArray(ch) ? ch : Object.keys(ch).map(function (k) { return ch[k]; });
        list.forEach(function (c, i) { var n = normChantier(c, i); out.chantiers[n.id] = n; });

        return out;
    }

    function loadLocalData() {
        try {
            var stored = localStorage.getItem(LS.DATA);
            if (stored) return normalize(JSON.parse(stored));

            // Migration depuis l'ancien format (v1/v2)
            var lp = localStorage.getItem(LS.LEGACY_POLES);
            var lc = localStorage.getItem(LS.LEGACY_CHANT);
            if (lp || lc) {
                var migrated = normalize({
                    poles: lp ? JSON.parse(lp) : {},
                    chantiers: lc ? JSON.parse(lc) : []
                });
                persistLocal(migrated);
                return migrated;
            }
        } catch (e) {
            console.warn("Lecture localStorage impossible :", e);
        }
        var s = seed();
        persistLocal(s);
        return s;
    }

    function persistLocal(data) {
        try {
            localStorage.setItem(LS.DATA, JSON.stringify({ poles: data.poles, chantiers: data.chantiers }));
            return true;
        } catch (e) {
            console.error("Écriture localStorage impossible :", e);
            setStatus("error", "Sauvegarde locale impossible");
            return false;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  État de synchro (relayé à l'UI)                                   */
    /* ------------------------------------------------------------------ */
    function setStatus(state, msg) {
        if (U.ui && U.ui.syncStatus) U.ui.syncStatus(active ? active.mode : "local", state, msg);
    }

    /* ================================================================== */
    /*  REPOSITORY LOCAL                                                  */
    /* ================================================================== */
    function LocalRepo() {
        this.mode = "local";
        this.data = loadLocalData();
    }
    LocalRepo.prototype.start = function () { U.store.set(this.data); setStatus("saved"); };
    LocalRepo.prototype._commit = function () {
        setStatus("saving");
        var ok = persistLocal(this.data);
        U.store.set(this.data);
        if (ok) setStatus("saved");
    };
    LocalRepo.prototype.upsertPole = function (p) { this.data.poles[p.id] = p; this._commit(); };
    LocalRepo.prototype.deletePole = function (id) { delete this.data.poles[id]; this._commit(); };
    LocalRepo.prototype.upsertChantier = function (c) { this.data.chantiers[c.id] = c; this._commit(); };
    LocalRepo.prototype.deleteChantier = function (id) { delete this.data.chantiers[id]; this._commit(); };
    LocalRepo.prototype.bulkReplace = function (data) { this.data = normalize(data); this._commit(); };
    LocalRepo.prototype.snapshot = function () { return { poles: this.data.poles, chantiers: this.data.chantiers }; };
    LocalRepo.prototype.stop = function () {};

    /* ================================================================== */
    /*  REPOSITORY FIRESTORE (SDK compat, chargé à la demande)            */
    /* ================================================================== */
    var fbApp = null;

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            if (document.querySelector('script[data-src="' + src + '"]')) return resolve();
            var s = document.createElement("script");
            s.src = src; s.async = true; s.setAttribute("data-src", src);
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error("Chargement échoué : " + src)); };
            document.head.appendChild(s);
        });
    }

    function loadFirebaseSDK() {
        var base = "https://www.gstatic.com/firebasejs/" + FB_VERSION + "/";
        return loadScript(base + "firebase-app-compat.js")
            .then(function () { return loadScript(base + "firebase-firestore-compat.js"); });
    }

    function FirestoreRepo(config, workspaceId) {
        this.mode = "cloud";
        this.config = config;
        this.workspaceId = workspaceId || "default";
        this.poles = {};
        this.chantiers = {};
        this._unsub = [];
        this._loaded = { poles: false, chantiers: false };
    }

    FirestoreRepo.prototype.start = function () {
        var self = this;
        setStatus("saving", "Connexion…");
        return loadFirebaseSDK().then(function () {
            var fb = window.firebase;
            if (fbApp) { try { fbApp.delete(); } catch (e) {} fbApp = null; }
            fbApp = fb.initializeApp(self.config, "ultra-" + Date.now());
            self.db = fbApp.firestore();
            try { self.db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
            self.ws = self.db.collection("workspaces").doc(self.workspaceId);
            return self._bootstrap();
        });
    };

    FirestoreRepo.prototype._emit = function () {
        if (!this._loaded.poles || !this._loaded.chantiers) return;
        U.store.set({ poles: this.poles, chantiers: this.chantiers });
    };

    FirestoreRepo.prototype._listen = function () {
        var self = this;
        this._unsub.push(this.ws.collection("poles").onSnapshot(function (snap) {
            var m = {}; snap.forEach(function (d) { m[d.id] = Object.assign({ id: d.id }, d.data()); });
            self.poles = m; self._loaded.poles = true; self._emit();
            setStatus(snap.metadata.hasPendingWrites ? "saving" : "saved");
        }, function (err) { console.error(err); setStatus("error", "Erreur de synchro"); }));

        this._unsub.push(this.ws.collection("chantiers").onSnapshot(function (snap) {
            var m = {}; snap.forEach(function (d) { m[d.id] = Object.assign({ id: d.id }, d.data()); });
            self.chantiers = m; self._loaded.chantiers = true; self._emit();
            setStatus(snap.metadata.hasPendingWrites ? "saving" : "saved");
        }, function (err) { console.error(err); setStatus("error", "Erreur de synchro"); }));
    };

    // Au premier branchement : si le cloud est vide et qu'on a des données locales, on les téléverse.
    FirestoreRepo.prototype._bootstrap = function () {
        var self = this;
        return Promise.all([
            this.ws.collection("poles").limit(1).get(),
            this.ws.collection("chantiers").limit(1).get()
        ]).then(function (res) {
            var cloudEmpty = res[0].empty && res[1].empty;
            if (cloudEmpty) {
                var local = normalize({
                    poles: safeParse(localStorage.getItem(LS.DATA), {}).poles,
                    chantiers: safeParse(localStorage.getItem(LS.DATA), {}).chantiers
                });
                var hasLocal = Object.keys(local.poles).length || Object.keys(local.chantiers).length;
                if (hasLocal) return self._uploadAll(local).then(function () { self._listen(); });
            }
            self._listen();
        });
    };

    FirestoreRepo.prototype._uploadAll = function (data) {
        var batch = this.db.batch();
        var self = this;
        Object.keys(data.poles).forEach(function (id) { batch.set(self.ws.collection("poles").doc(id), data.poles[id]); });
        Object.keys(data.chantiers).forEach(function (id) { batch.set(self.ws.collection("chantiers").doc(id), data.chantiers[id]); });
        return batch.commit();
    };

    FirestoreRepo.prototype.upsertPole = function (p) {
        var self = this; setStatus("saving");
        this.ws.collection("poles").doc(p.id).set(p).catch(function (e) { console.error(e); setStatus("error", "Échec sauvegarde"); U.ui && U.ui.toast("Sauvegarde cloud échouée", "error"); });
    };
    FirestoreRepo.prototype.deletePole = function (id) {
        this.ws.collection("poles").doc(id).delete().catch(function (e) { console.error(e); });
    };
    FirestoreRepo.prototype.upsertChantier = function (c) {
        setStatus("saving");
        this.ws.collection("chantiers").doc(c.id).set(c).catch(function (e) { console.error(e); setStatus("error", "Échec sauvegarde"); U.ui && U.ui.toast("Sauvegarde cloud échouée", "error"); });
    };
    FirestoreRepo.prototype.deleteChantier = function (id) {
        this.ws.collection("chantiers").doc(id).delete().catch(function (e) { console.error(e); });
    };
    FirestoreRepo.prototype.bulkReplace = function (data) {
        var self = this; var norm = normalize(data);
        // Supprime ce qui n'existe plus puis (ré)écrit tout.
        var batch = this.db.batch();
        Object.keys(this.poles).forEach(function (id) { if (!norm.poles[id]) batch.delete(self.ws.collection("poles").doc(id)); });
        Object.keys(this.chantiers).forEach(function (id) { if (!norm.chantiers[id]) batch.delete(self.ws.collection("chantiers").doc(id)); });
        Object.keys(norm.poles).forEach(function (id) { batch.set(self.ws.collection("poles").doc(id), norm.poles[id]); });
        Object.keys(norm.chantiers).forEach(function (id) { batch.set(self.ws.collection("chantiers").doc(id), norm.chantiers[id]); });
        batch.commit().catch(function (e) { console.error(e); });
    };
    FirestoreRepo.prototype.snapshot = function () { return { poles: this.poles, chantiers: this.chantiers }; };
    FirestoreRepo.prototype.stop = function () {
        this._unsub.forEach(function (u) { try { u(); } catch (e) {} });
        this._unsub = [];
        if (fbApp) { try { fbApp.delete(); } catch (e) {} fbApp = null; }
    };

    /* ------------------------------------------------------------------ */
    /*  Utilitaires config                                                */
    /* ------------------------------------------------------------------ */
    function safeParse(str, fallback) { try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; } }

    // Accepte du JSON strict OU un littéral objet JS (comme copié depuis la console Firebase).
    function parseConfig(text) {
        text = (text || "").trim();
        if (!text) return null;
        var start = text.indexOf("{"), end = text.lastIndexOf("}");
        if (start === -1 || end === -1) return null;
        var body = text.slice(start, end + 1);
        try { return JSON.parse(body); } catch (e) {}
        try { return (new Function("return (" + body + ")"))(); } catch (e) { return null; }
    }

    /* ================================================================== */
    /*  API publique                                                      */
    /* ================================================================== */
    var active = null;

    var persistence = {
        get mode() { return active ? active.mode : "local"; },
        getWorkspace: function () { return localStorage.getItem(LS.WS) || "default"; },
        getRawConfig: function () { return localStorage.getItem(LS.CFG) || ""; },
        hasConfig: function () { return !!localStorage.getItem(LS.CFG); },

        // Démarrage : cloud si configuré, sinon local (avec repli en cas d'échec).
        init: function () {
            var cfgStr = localStorage.getItem(LS.CFG);
            if (cfgStr) {
                var cfg = safeParse(cfgStr, null);
                if (cfg) {
                    active = new FirestoreRepo(cfg, this.getWorkspace());
                    return active.start().catch(function (e) {
                        console.error("Firebase KO, repli local :", e);
                        U.ui && U.ui.toast("Connexion Firebase impossible — mode local", "error");
                        active = new LocalRepo(); active.start();
                    });
                }
            }
            active = new LocalRepo(); active.start();
            return Promise.resolve();
        },

        // Connexion cloud depuis les réglages.
        connectCloud: function (configText, workspaceId) {
            var cfg = parseConfig(configText);
            if (!cfg || !cfg.projectId) return Promise.reject(new Error("Configuration invalide"));
            var ws = (workspaceId || "default").trim() || "default";
            localStorage.setItem(LS.CFG, JSON.stringify(cfg));
            localStorage.setItem(LS.WS, ws);
            if (active) active.stop();
            active = new FirestoreRepo(cfg, ws);
            return active.start();
        },

        // Retour au mode local : on conserve un instantané des données courantes.
        disconnectCloud: function () {
            var snap = active ? active.snapshot() : null;
            if (snap) persistLocal(normalize(snap));
            localStorage.removeItem(LS.CFG);
            if (active) active.stop();
            active = new LocalRepo();
            active.start();
        },

        replaceAll: function (data) { if (active) active.bulkReplace(data); },
        reset: function () { this.replaceAll(seed()); },
        currentSnapshot: function () { return active ? active.snapshot() : { poles: {}, chantiers: {} }; }
    };

    // Exposé pour les mutations du store.
    Object.defineProperty(U, "active", { get: function () { return active; } });
    U.persistence = persistence;

})(window.Ultra);
