/* =========================================================
   Ultra Macro — Couche de persistance
   Deux repositories interchangeables, même contrat :
     start(), upsertPole/deletePole, upsertChantier/deleteChantier,
     bulkReplace(data), stop().
   Chaque changement appelle U.store.set(data) → rendu.

   Objectif "aucun bug de sauvegarde" :
   - écritures par entité (jamais d'écrasement global) ;
   - Firebase Realtime Database en temps réel (file d'attente hors-ligne) ;
   - repli localStorage transparent si la base est injoignable.
   ========================================================= */
(function (U) {
    "use strict";

    var FB_VERSION = "10.12.5";
    // URL Realtime Database par défaut : l'app déployée s'y connecte automatiquement.
    var DEFAULT_DB_URL = "https://ultra-macro-default-rtdb.europe-west1.firebasedatabase.app/";
    var LS = {
        DATA: "ultra_macro_data_v3",
        DBURL: "ultra_macro_db_url",
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
    /*  REPOSITORY REALTIME DATABASE (SDK compat, chargé à la demande)    */
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
            .then(function () { return loadScript(base + "firebase-database-compat.js"); });
    }

    function safeParse(str, fallback) { try { return str ? JSON.parse(str) : fallback; } catch (e) { return fallback; } }

    function RealtimeRepo(dbUrl, workspaceId) {
        this.mode = "cloud";
        this.dbUrl = dbUrl;
        this.workspaceId = workspaceId || "default";
        this.poles = {};
        this.chantiers = {};
        this._loaded = { poles: false, chantiers: false };
        this._refs = [];
    }

    RealtimeRepo.prototype.start = function () {
        var self = this;
        setStatus("saving", "Connexion…");
        return loadFirebaseSDK().then(function () {
            var fb = window.firebase;
            if (fbApp) { try { fbApp.delete(); } catch (e) {} fbApp = null; }
            fbApp = fb.initializeApp({ databaseURL: self.dbUrl }, "ultra-" + Date.now());
            self.db = fbApp.database();
            self.base = self.db.ref("workspaces/" + self.workspaceId);
            return self._bootstrap();
        });
    };

    RealtimeRepo.prototype._emit = function () {
        if (!this._loaded.poles || !this._loaded.chantiers) return;
        U.store.set({ poles: this.poles, chantiers: this.chantiers });
    };

    RealtimeRepo.prototype._listen = function () {
        var self = this;
        function bind(key) {
            var ref = self.base.child(key);
            var cb = ref.on("value", function (snap) {
                self[key] = snap.val() || {};
                self._loaded[key] = true;
                self._emit();
                setStatus("saved");
            }, function (err) { console.error(err); setStatus("error", "Erreur de synchro"); });
            self._refs.push({ ref: ref, cb: cb });
        }
        bind("poles");
        bind("chantiers");
    };

    // Premier branchement : si le workspace cloud est vide, on téléverse les données locales (ou le seed).
    RealtimeRepo.prototype._bootstrap = function () {
        var self = this;
        return self.base.once("value").then(function (snap) {
            var val = snap.val() || {};
            var empty = !val.poles && !val.chantiers;
            if (empty) {
                var local = normalize(safeParse(localStorage.getItem(LS.DATA), {}));
                var hasLocal = Object.keys(local.poles).length || Object.keys(local.chantiers).length;
                var initial = hasLocal ? local : seed();
                return self.base.set({ poles: initial.poles, chantiers: initial.chantiers })
                    .then(function () { self._listen(); });
            }
            self._listen();
        });
    };

    function cloudFail(e) { console.error(e); setStatus("error", "Échec sauvegarde"); U.ui && U.ui.toast("Sauvegarde cloud échouée", "error"); }

    RealtimeRepo.prototype.upsertPole = function (p) { setStatus("saving"); this.base.child("poles/" + p.id).set(p).catch(cloudFail); };
    RealtimeRepo.prototype.deletePole = function (id) { this.base.child("poles/" + id).remove().catch(cloudFail); };
    RealtimeRepo.prototype.upsertChantier = function (c) { setStatus("saving"); this.base.child("chantiers/" + c.id).set(c).catch(cloudFail); };
    RealtimeRepo.prototype.deleteChantier = function (id) { this.base.child("chantiers/" + id).remove().catch(cloudFail); };
    RealtimeRepo.prototype.bulkReplace = function (data) {
        var n = normalize(data);
        this.base.set({ poles: n.poles, chantiers: n.chantiers }).catch(cloudFail);
    };
    RealtimeRepo.prototype.snapshot = function () { return { poles: this.poles, chantiers: this.chantiers }; };
    RealtimeRepo.prototype.stop = function () {
        this._refs.forEach(function (r) { try { r.ref.off("value", r.cb); } catch (e) {} });
        this._refs = [];
        if (fbApp) { try { fbApp.delete(); } catch (e) {} fbApp = null; }
    };

    /* ================================================================== */
    /*  API publique                                                      */
    /* ================================================================== */
    var active = null;

    var persistence = {
        get mode() { return active ? active.mode : "local"; },
        getWorkspace: function () { return localStorage.getItem(LS.WS) || "default"; },
        // URL sauvegardée si présente, sinon URL par défaut (auto-connexion au 1er lancement).
        getDbUrl: function () {
            var u = localStorage.getItem(LS.DBURL);
            return (u === null) ? DEFAULT_DB_URL : u;
        },

        // Démarrage : cloud si une URL est disponible, sinon local (avec repli en cas d'échec).
        init: function () {
            var url = this.getDbUrl();
            if (url) {
                active = new RealtimeRepo(url, this.getWorkspace());
                return active.start().catch(function (e) {
                    console.error("Realtime DB KO, repli local :", e);
                    U.ui && U.ui.toast("Connexion à la base impossible — mode local", "error");
                    active = new LocalRepo(); active.start();
                });
            }
            active = new LocalRepo(); active.start();
            return Promise.resolve();
        },

        // Connexion cloud depuis les réglages (URL Realtime Database).
        connectCloud: function (dbUrl, workspaceId) {
            dbUrl = (dbUrl || "").trim();
            if (!/^https?:\/\/[^\s]+/.test(dbUrl)) return Promise.reject(new Error("URL invalide (https://…firebasedatabase.app)"));
            var ws = (workspaceId || "default").trim() || "default";
            localStorage.setItem(LS.DBURL, dbUrl);
            localStorage.setItem(LS.WS, ws);
            if (active) active.stop();
            active = new RealtimeRepo(dbUrl, ws);
            return active.start();
        },

        // Retour au mode local : on conserve un instantané des données courantes.
        disconnectCloud: function () {
            // Conserve les données cloud en local — mais ne JAMAIS écraser le local avec un snapshot vide
            // (ex. connexion refusée/échouée), sinon on perdrait les chantiers existants.
            var snap = active ? active.snapshot() : null;
            if (snap && (Object.keys(snap.poles || {}).length || Object.keys(snap.chantiers || {}).length)) {
                persistLocal(normalize(snap));
            }
            localStorage.setItem(LS.DBURL, "");   // reste en local (désactive l'auto-connexion)
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
