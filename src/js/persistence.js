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
    // URL suggérée, PRÉ-REMPLIE dans les réglages. Pas d'auto-connexion : le cloud est opt-in
    // (on se connecte explicitement) pour éviter toute confusion ou écrasement de données.
    var SUGGESTED_DB_URL = "https://ultra-macro-default-rtdb.europe-west1.firebasedatabase.app/";
    var LS = {
        DATA: "ultra_macro_data_v3",
        DBURL: "ultra_macro_db_url",
        WS: "ultra_macro_fb_workspace",
        LEGACY_POLES: "ultra_macro_poles",
        LEGACY_CHANT: "ultra_macro_chantiers"
    };

    /* ------------------------------------------------------------------ */
    /*  Aucune donnée par défaut : on démarre TOUJOURS vide.              */
    /*  (Garantit qu'aucune donnée de démo ne peut écraser les vôtres.)   */
    /* ------------------------------------------------------------------ */
    function seed() {
        return { poles: {}, chantiers: {}, objectives: {}, dailysections: {}, dailytasks: {} };
    }

    /* ------------------------------------------------------------------ */
    /*  Normalisation / migration                                         */
    /* ------------------------------------------------------------------ */
    // Les clés servent de chemins Realtime Database : on retire les caractères interdits (. # $ [ ] /).
    function sanitizeKey(k) { return String(k).replace(/[.#$\[\]\/]/g, "_"); }

    function normChantier(c, i) {
        var id = sanitizeKey(c.id != null ? c.id : U.uid());
        var now = new Date().toISOString();
        return {
            id: id,
            nom: (c.nom || c.name || "Sans nom").toString(),
            pole: c.pole ? sanitizeKey(c.pole) : null,
            statut: U.STATUSES[c.statut] ? c.statut : "prevu",
            priorite: U.PRIORITIES[c.priorite] ? c.priorite : U.DEFAULT_PRIORITY,
            responsable: c.responsable || null,
            deadline: c.deadline || null,
            progression: U.clamp(Number(c.progression) || 0, 0, 100),
            notes: c.notes || null,
            completedAt: c.completedAt || null,
            createdAt: c.createdAt || now,
            updatedAt: c.updatedAt || now,
            order: (typeof c.order === "number") ? c.order : (i || 0)
        };
    }

    function dec2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

    function normObjective(o, i) {
        var id = sanitizeKey(o.id != null ? o.id : ("obj_" + U.uid()));
        var t = dec2(o.target); if (!(t > 0)) t = 1;
        var cu = dec2(o.current); if (!(cu >= 0)) cu = 0;
        return {
            id: id,
            label: (o.label || "Objectif").toString(),
            period: o.period === "week" ? "week" : "month",
            target: t,
            current: cu,
            order: (typeof o.order === "number") ? o.order : (i || 0)
        };
    }

    function normDailySection(s, i) {
        var id = sanitizeKey(s.id != null ? s.id : ("sec_" + U.uid()));
        return {
            id: id,
            name: (s.name || "Section").toString(),
            order: (typeof s.order === "number") ? s.order : (i || 0)
        };
    }

    function normDailyTask(t, i) {
        var id = sanitizeKey(t.id != null ? t.id : ("task_" + U.uid()));
        var now = new Date().toISOString();
        return {
            id: id,
            title: (t.title || t.nom || "Tâche").toString(),
            section: t.section ? sanitizeKey(t.section) : null,
            done: !!t.done,
            priority: U.PRIORITIES[t.priority] ? t.priority : null,
            due: t.due || null,
            assignee: t.assignee || null,
            chantier: t.chantier ? sanitizeKey(t.chantier) : null,
            notes: t.notes || null,
            order: (typeof t.order === "number") ? t.order : (i || 0),
            createdAt: t.createdAt || now,
            updatedAt: t.updatedAt || now,
            completedAt: t.completedAt || null
        };
    }

    function normalize(raw) {
        raw = raw || {};
        var out = { poles: {}, chantiers: {}, objectives: {}, dailysections: {}, dailytasks: {} };

        var poles = raw.poles || {};
        Object.keys(poles).forEach(function (k, i) {
            var p = poles[k] || {};
            var id = sanitizeKey(p.id || k);
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

        var ob = raw.objectives || {};
        var olist = Array.isArray(ob) ? ob : Object.keys(ob).map(function (k) { return ob[k]; });
        olist.forEach(function (o, i) { var n = normObjective(o, i); out.objectives[n.id] = n; });

        var ds = raw.dailysections || {};
        var dslist = Array.isArray(ds) ? ds : Object.keys(ds).map(function (k) { return ds[k]; });
        dslist.forEach(function (s, i) { var n = normDailySection(s, i); out.dailysections[n.id] = n; });

        var dt = raw.dailytasks || {};
        var dtlist = Array.isArray(dt) ? dt : Object.keys(dt).map(function (k) { return dt[k]; });
        dtlist.forEach(function (t, i) { var n = normDailyTask(t, i); out.dailytasks[n.id] = n; });

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
            localStorage.setItem(LS.DATA, JSON.stringify({ poles: data.poles, chantiers: data.chantiers, objectives: data.objectives || {}, dailysections: data.dailysections || {}, dailytasks: data.dailytasks || {} }));
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
    LocalRepo.prototype.upsertObjective = function (o) { this.data.objectives[o.id] = o; this._commit(); };
    LocalRepo.prototype.deleteObjective = function (id) { delete this.data.objectives[id]; this._commit(); };
    LocalRepo.prototype.upsertDailySection = function (s) { this.data.dailysections[s.id] = s; this._commit(); };
    LocalRepo.prototype.deleteDailySection = function (id) { delete this.data.dailysections[id]; this._commit(); };
    LocalRepo.prototype.upsertDailyTask = function (t) { this.data.dailytasks[t.id] = t; this._commit(); };
    LocalRepo.prototype.deleteDailyTask = function (id) { delete this.data.dailytasks[id]; this._commit(); };
    LocalRepo.prototype.bulkReplace = function (data) { this.data = normalize(data); this._commit(); };
    LocalRepo.prototype.snapshot = function () { return { poles: this.data.poles, chantiers: this.data.chantiers, objectives: this.data.objectives, dailysections: this.data.dailysections, dailytasks: this.data.dailytasks }; };
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
        this.objectives = {};
        this.dailysections = {};
        this.dailytasks = {};
        this._loaded = { poles: false, chantiers: false, objectives: false, dailysections: false, dailytasks: false };
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
        if (!this._loaded.poles || !this._loaded.chantiers || !this._loaded.objectives
            || !this._loaded.dailysections || !this._loaded.dailytasks) return;
        U.store.set({
            poles: this.poles, chantiers: this.chantiers, objectives: this.objectives,
            dailysections: this.dailysections, dailytasks: this.dailytasks
        });
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
        bind("objectives");
        bind("dailysections");
        bind("dailytasks");
    };

    // Premier branchement : si le workspace cloud est vide, on téléverse les données locales (ou le seed).
    RealtimeRepo.prototype._bootstrap = function () {
        var self = this;
        return self.base.once("value").then(function (snap) {
            var val = snap.val() || {};
            var empty = !val.poles && !val.chantiers;
            if (empty) {
                // Cloud vide : on téléverse les données locales existantes (migration voulue),
                // mais jamais de données de démo synthétiques (évite de polluer un cloud partagé).
                var local = normalize(safeParse(localStorage.getItem(LS.DATA), {}));
                var hasLocal = Object.keys(local.poles).length || Object.keys(local.chantiers).length;
                if (hasLocal) {
                    return self.base.set({
                        poles: local.poles, chantiers: local.chantiers, objectives: local.objectives || {},
                        dailysections: local.dailysections || {}, dailytasks: local.dailytasks || {}
                    }).then(function () { self._listen(); });
                }
            }
            self._listen();
        });
    };

    function cloudFail(e) { console.error(e); setStatus("error", "Échec sauvegarde"); U.ui && U.ui.toast("Sauvegarde cloud échouée", "error"); }

    RealtimeRepo.prototype.upsertPole = function (p) { setStatus("saving"); this.base.child("poles/" + p.id).set(p).catch(cloudFail); };
    RealtimeRepo.prototype.deletePole = function (id) { this.base.child("poles/" + id).remove().catch(cloudFail); };
    RealtimeRepo.prototype.upsertChantier = function (c) { setStatus("saving"); this.base.child("chantiers/" + c.id).set(c).catch(cloudFail); };
    RealtimeRepo.prototype.deleteChantier = function (id) { this.base.child("chantiers/" + id).remove().catch(cloudFail); };
    RealtimeRepo.prototype.upsertObjective = function (o) { setStatus("saving"); this.base.child("objectives/" + o.id).set(o).catch(cloudFail); };
    RealtimeRepo.prototype.deleteObjective = function (id) { this.base.child("objectives/" + id).remove().catch(cloudFail); };
    RealtimeRepo.prototype.upsertDailySection = function (s) { setStatus("saving"); this.base.child("dailysections/" + s.id).set(s).catch(cloudFail); };
    RealtimeRepo.prototype.deleteDailySection = function (id) { this.base.child("dailysections/" + id).remove().catch(cloudFail); };
    RealtimeRepo.prototype.upsertDailyTask = function (t) { setStatus("saving"); this.base.child("dailytasks/" + t.id).set(t).catch(cloudFail); };
    RealtimeRepo.prototype.deleteDailyTask = function (id) { this.base.child("dailytasks/" + id).remove().catch(cloudFail); };
    RealtimeRepo.prototype.bulkReplace = function (data) {
        var n = normalize(data);
        this.base.set({
            poles: n.poles, chantiers: n.chantiers, objectives: n.objectives,
            dailysections: n.dailysections, dailytasks: n.dailytasks
        }).catch(cloudFail);
    };
    RealtimeRepo.prototype.snapshot = function () { return { poles: this.poles, chantiers: this.chantiers, objectives: this.objectives, dailysections: this.dailysections, dailytasks: this.dailytasks }; };
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
        // URL cloud effective : jamais configurée (null) → URL par défaut = CONNEXION AUTOMATIQUE ;
        // "" → l'utilisateur a explicitement choisi le mode local ; sinon → l'URL choisie.
        getDbUrl: function () {
            var s = localStorage.getItem(LS.DBURL);
            return (s === null) ? SUGGESTED_DB_URL : s;
        },
        // URL à pré-remplir dans les réglages.
        suggestedUrl: SUGGESTED_DB_URL,

        // Démarrage : connexion cloud automatique à la base par défaut (sans configuration),
        // sauf si l'utilisateur est passé explicitement en local. Repli local si injoignable.
        init: function () {
            var url = this.getDbUrl();
            if (url) {
                active = new RealtimeRepo(url, this.getWorkspace());
                return active.start().catch(function (e) {
                    var msg = (e && e.message) || "";
                    console.warn("Realtime DB indisponible, mode local :", msg);
                    var denied = /permission_denied/i.test(msg);
                    U.ui && U.ui.toast(denied ? "Base non autorisée — déployez les règles (mode local)" : "Base injoignable — mode local", "error");
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
            var prev = active;
            var repo = new RealtimeRepo(dbUrl, ws);
            // On ne bascule (et on ne mémorise l'URL) qu'en cas de succès :
            // en cas d'échec, l'ancien repo reste actif et l'URL n'est pas enregistrée.
            return repo.start().then(function () {
                active = repo;
                if (prev && prev !== repo) { try { prev.stop(); } catch (e) {} }
                localStorage.setItem(LS.DBURL, dbUrl);
                localStorage.setItem(LS.WS, ws);
            }).catch(function (err) {
                try { repo.stop(); } catch (e) {}
                throw err;
            });
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
        currentSnapshot: function () { return active ? active.snapshot() : { poles: {}, chantiers: {} }; }
    };

    // Exposé pour les mutations du store.
    Object.defineProperty(U, "active", { get: function () { return active; } });
    U.persistence = persistence;

})(window.Ultra);
