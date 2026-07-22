/* =========================================================
   Ultra Macro — Store (état en mémoire + sélecteurs + mutations)
   La persistance est déléguée au repository actif (U.active),
   qui rappelle U.store.set() avec les données à jour → rendu.
   ========================================================= */
(function (U) {
    "use strict";

    var listeners = [];
    var store = {
        data: { poles: {}, chantiers: {}, objectives: {}, dailysections: {}, dailytasks: {}, inbox: {}, contacts: {}, reports: {}, conversations: {} },
        ready: false
    };

    /* --------- Abonnement UI --------- */
    store.subscribe = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; };
    function emit() { listeners.forEach(function (fn) { try { fn(store.data); } catch (e) { console.error(e); } }); }

    // Appelé par le repository quand des données faisant autorité arrivent.
    store.set = function (data) {
        store.data = {
            poles: data && data.poles ? data.poles : {},
            chantiers: data && data.chantiers ? data.chantiers : {},
            objectives: data && data.objectives ? data.objectives : {},
            dailysections: data && data.dailysections ? data.dailysections : {},
            dailytasks: data && data.dailytasks ? data.dailytasks : {},
            inbox: data && data.inbox ? data.inbox : {},
            contacts: data && data.contacts ? data.contacts : {},
            reports: data && data.reports ? data.reports : {},
            conversations: data && data.conversations ? data.conversations : {}
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

    // Libellés uniques pour la saisie « chantier » (datalist scalable) : label <-> id.
    store.chantierLabelMaps = function () {
        var byId = {}, byLabel = {};
        var list = store.chantiersArray();
        var nameCount = {};
        list.forEach(function (c) { nameCount[c.nom] = (nameCount[c.nom] || 0) + 1; });
        list.forEach(function (c) {
            var label = c.nom;
            if (nameCount[c.nom] > 1) { var p = store.pole(c.pole); label = c.nom + (p ? " · " + p.name : ""); }
            var base = label, n = 2;
            while (byLabel[label] && byLabel[label] !== c.id) { label = base + " #" + n; n++; }
            byLabel[label] = c.id; byId[c.id] = label;
        });
        return { byId: byId, byLabel: byLabel };
    };
    store.chantierLabel = function (id) { return store.chantierLabelMaps().byId[id] || ""; };
    store.chantierIdForLabel = function (label) { return store.chantierLabelMaps().byLabel[(label || "").trim()] || null; };

    // Tâches (daily) rattachées à un chantier — actives d'abord, terminées ensuite.
    store.dailyTasksOfChantier = function (chantierId) {
        return store.dailyTasksArray().filter(function (t) { return t.chantier === chantierId; })
            .sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.order || 0) - (b.order || 0); });
    };

    store.poleActiveCount = function (poleId) {
        return store.chantiersOfPole(poleId).filter(function (c) { return c.statut !== "termine"; }).length;
    };

    // Liste unique des responsables (chantiers + assignés par défaut des pôles).
    store.responsables = function () {
        var set = {};
        store.chantiersArray().forEach(function (c) { if (c.responsable) set[c.responsable] = true; });
        store.polesArray().forEach(function (p) { if (p.defaultResponsable) set[p.defaultResponsable] = true; });
        store.dailyTasksArray().forEach(function (t) { if (t.assignee) set[t.assignee] = true; });
        store.contactsArray().forEach(function (c) { if (c.name) set[c.name] = true; });
        return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "fr"); });
    };

    // Retire un responsable partout (désassigne ses chantiers, efface les défauts de pôle).
    // Renvoie le nombre de chantiers désassignés.
    store.removeResponsable = function (name) {
        if (!name) return 0;
        var count = 0;
        var now = new Date().toISOString();
        store.chantiersArray().forEach(function (c) {
            if (c.responsable === name) {
                U.active.upsertChantier(Object.assign({}, c, { responsable: null, updatedAt: now }));
                count++;
            }
        });
        store.polesArray().forEach(function (p) {
            if (p.defaultResponsable === name) {
                U.active.upsertPole(Object.assign({}, p, { defaultResponsable: null }));
            }
        });
        store.dailyTasksArray().forEach(function (t) {
            if (t.assignee === name) U.active.upsertDailyTask(Object.assign({}, t, { assignee: null, updatedAt: now }));
        });
        return count;
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

    // Date d'accomplissement (repli sur updatedAt/createdAt pour les anciens chantiers).
    store.doneDate = function (c) { return c.completedAt || c.updatedAt || c.createdAt || ""; };

    // Chantiers terminés d'un pôle, les plus récemment accomplis d'abord.
    store.poleRecentDone = function (poleId, limit) {
        var done = store.chantiersOfPole(poleId).filter(function (c) { return c.statut === "termine"; });
        done.sort(function (a, b) { return String(store.doneDate(b)).localeCompare(String(store.doneDate(a))); });
        return limit ? done.slice(0, limit) : done;
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
        // Le responsable par défaut du pôle est pré-rempli par le formulaire (ui.openChantier),
        // donc surchargeable : si l'utilisateur choisit « Non assigné », on le respecte.
        var responsable = (input.responsable || "").trim() || null;
        var statut = U.STATUSES[input.statut] ? input.statut : "prevu";
        // Date d'accomplissement : posée au passage en « terminé », conservée si déjà présente, effacée sinon.
        var completedAt = null;
        if (statut === "termine") completedAt = (existing && existing.completedAt) ? existing.completedAt : nowISO();
        var chantier = {
            id: input.id || U.uid(),
            nom: (input.nom || "").trim(),
            pole: input.pole,
            statut: statut,
            priorite: U.PRIORITIES[input.priorite] ? input.priorite : U.DEFAULT_PRIORITY,
            responsable: responsable,
            deadline: input.deadline || null,
            progression: U.clamp(Number(input.progression) || 0, 0, 100),
            notes: (input.notes || "").trim() || null,
            completedAt: completedAt,
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
        if (statut === "termine") {
            if (!updated.progression || updated.progression < 100) updated.progression = 100;
            if (c.statut !== "termine" || !c.completedAt) updated.completedAt = nowISO();
        } else {
            updated.completedAt = null;
        }
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
            defaultResponsable: (input.defaultResponsable || "").trim() || null,
            order: existing ? existing.order : (store.polesArray().length)
        };
        if (!pole.name) return null;
        U.active.upsertPole(pole);
        return pole;
    };

    // Réordonne les pôles : déplace draggedId juste avant targetId, puis réattribue les 'order'.
    store.movePole = function (draggedId, targetId) {
        if (!draggedId || draggedId === targetId) return;
        var arr = store.polesArray("manual");
        var from = arr.map(function (p) { return p.id; }).indexOf(draggedId);
        var to = arr.map(function (p) { return p.id; }).indexOf(targetId);
        if (from < 0 || to < 0) return;
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        arr.forEach(function (p, i) {
            if (p.order !== i) U.active.upsertPole(Object.assign({}, p, { order: i }));
        });
    };

    store.deletePole = function (id) {
        if (store.chantiersOfPole(id).length > 0) return false;
        U.active.deletePole(id);
        return true;
    };

    /* --------- Objectifs généraux (hebdo / mensuel + barre de progression) --------- */
    store.objectivesArray = function () {
        return Object.keys(store.data.objectives).map(function (k) { return store.data.objectives[k]; })
            .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    };
    store.objective = function (id) { return store.data.objectives[id] || null; };

    // Arrondi à 2 décimales (évite le bruit des flottants) tout en autorisant les décimales.
    function dec2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

    store.saveObjective = function (input) {
        var existing = input.id ? store.objective(input.id) : null;
        var t = dec2(input.target); if (!(t > 0)) t = 1;
        var cu = dec2(input.current); if (!(cu >= 0)) cu = 0;
        var obj = {
            id: input.id || ("obj_" + U.uid()),
            label: (input.label || "").trim(),
            period: input.period === "week" ? "week" : "month",
            target: t,
            current: cu,
            achieved: input.achieved != null ? !!input.achieved : (existing ? !!existing.achieved : false),
            archived: input.archived != null ? !!input.archived : (existing ? !!existing.archived : false),
            order: existing ? existing.order : store.objectivesArray().length
        };
        if (!obj.label) return null;
        U.active.upsertObjective(obj);
        return obj;
    };
    store.deleteObjective = function (id) { U.active.deleteObjective(id); };
    store.setObjectiveAchieved = function (id, v) { var o = store.objective(id); if (o) U.active.upsertObjective(Object.assign({}, o, { achieved: !!v })); };
    store.setObjectiveArchived = function (id, v) { var o = store.objective(id); if (o) U.active.upsertObjective(Object.assign({}, o, { archived: v !== false })); };
    store.hasArchivedObjectives = function () { return store.objectivesArray().some(function (o) { return o.archived; }); };

    /* --------- Daily tasks (liste « à la Asana » : sections + tâches) --------- */
    store.dailySectionsArray = function () {
        return Object.keys(store.data.dailysections).map(function (k) { return store.data.dailysections[k]; })
            .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    };
    store.dailySection = function (id) { return store.data.dailysections[id] || null; };
    store.dailyTasksArray = function () {
        return Object.keys(store.data.dailytasks).map(function (k) { return store.data.dailytasks[k]; });
    };
    store.dailyTask = function (id) { return store.data.dailytasks[id] || null; };

    // Section effective d'une tâche : null si aucune ou si la section n'existe plus (orpheline).
    function taskSection(t) {
        return (t.section && store.data.dailysections[t.section]) ? t.section : null;
    }
    store.taskSection = taskSection;

    // Tâches d'une section (sectionId null → tâches sans section / orphelines), triées par ordre.
    store.dailyTasksOfSection = function (sectionId) {
        var want = sectionId || null;
        return store.dailyTasksArray()
            .filter(function (t) { return taskSection(t) === want; })
            .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    };
    // Vrai s'il reste des tâches orphelines (sans section valide) à afficher dans le groupe implicite.
    store.hasOrphanTasks = function () { return store.dailyTasksOfSection(null).length > 0; };

    store.saveDailySection = function (input) {
        var existing = input.id ? store.dailySection(input.id) : null;
        var sec = {
            id: input.id || ("sec_" + U.uid()),
            name: (input.name || "").trim() || "Section",
            order: existing ? existing.order : store.dailySectionsArray().length
        };
        U.active.upsertDailySection(sec);
        return sec;
    };
    // Supprime une section sans perdre ses tâches : elles repassent « sans section ».
    store.deleteDailySection = function (id) {
        store.dailyTasksArray().forEach(function (t) {
            if (t.section === id) U.active.upsertDailyTask(Object.assign({}, t, { section: null, updatedAt: nowISO() }));
        });
        U.active.deleteDailySection(id);
    };

    store.saveDailyTask = function (input) {
        var existing = input.id ? store.dailyTask(input.id) : null;
        var done = input.done != null ? !!input.done : (existing ? existing.done : false);
        var section = (input.section && store.data.dailysections[input.section]) ? input.section
            : (input.section === null ? null : (existing ? existing.section : null));
        if (section && !store.data.dailysections[section]) section = null;
        var completedAt = null;
        if (done) completedAt = (existing && existing.completedAt) ? existing.completedAt : nowISO();
        var assignee = (input.assignee !== undefined) ? ((input.assignee || "").trim() || null) : (existing ? existing.assignee : null);
        var chantier = (input.chantier !== undefined) ? (input.chantier || null) : (existing ? existing.chantier : null);
        if (chantier && !store.chantier(chantier)) chantier = null; // lien vers un chantier inexistant → aucun
        var task = {
            id: input.id || ("task_" + U.uid()),
            title: (input.title || "").trim(),
            section: section || null,
            done: done,
            priority: U.PRIORITIES[input.priority] ? input.priority : null,
            due: input.due || null,
            assignee: assignee,
            chantier: chantier,
            notes: (input.notes || "").trim() || null,
            order: existing ? existing.order : Date.now(),
            createdAt: existing ? existing.createdAt : nowISO(),
            updatedAt: nowISO(),
            completedAt: completedAt
        };
        if (!task.title) return null;
        U.active.upsertDailyTask(task);
        return task;
    };

    store.setDailyTaskDone = function (id, done) {
        var t = store.dailyTask(id); if (!t) return;
        var updated = Object.assign({}, t, { done: !!done, updatedAt: nowISO() });
        updated.completedAt = done ? ((t.done && t.completedAt) ? t.completedAt : nowISO()) : null;
        U.active.upsertDailyTask(updated);
    };

    store.deleteDailyTask = function (id) { U.active.deleteDailyTask(id); };

    // Réordonne / déplace une tâche : la pose juste avant targetId (ou en fin de sectionId),
    // puis réattribue les 'order' de la section de destination.
    store.moveDailyTask = function (draggedId, targetId, sectionId) {
        var dragged = store.dailyTask(draggedId); if (!dragged) return;
        var secId = sectionId || null;
        var beforeId = null;
        if (targetId && targetId !== draggedId) {
            var t = store.dailyTask(targetId);
            if (t) { secId = taskSection(t); beforeId = t.id; }
        }
        var list = store.dailyTasksOfSection(secId).filter(function (x) { return x.id !== draggedId; });
        var idx = beforeId ? list.map(function (x) { return x.id; }).indexOf(beforeId) : list.length;
        if (idx < 0) idx = list.length;
        list.splice(idx, 0, dragged);
        list.forEach(function (x, i) {
            var newSection = secId || null;
            if (x.order !== i || (x.section || null) !== newSection) {
                U.active.upsertDailyTask(Object.assign({}, x, { order: i, section: newSection, updatedAt: nowISO() }));
            }
        });
    };

    /* --------- Contacts WhatsApp (numéro → personne) --------- */
    store.contactsArray = function () {
        return Object.keys(store.data.contacts).map(function (k) { return store.data.contacts[k]; })
            .sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", "fr"); });
    };
    function normPhone(p) { return String(p || "").replace(/[^\d+]/g, ""); }
    store.contactForPhone = function (phone) {
        if (!phone) return null;
        var want = normPhone(phone), found = null;
        store.contactsArray().forEach(function (c) { if (c.phone && normPhone(c.phone) === want) found = c; });
        return found;
    };
    store.saveContact = function (input) {
        var existing = input.id ? store.data.contacts[input.id] : null;
        var pole = (input.pole && store.data.poles[input.pole]) ? input.pole : null;
        var contact = {
            id: input.id || ("ct_" + U.uid()),
            phone: (input.phone || "").trim(),
            name: (input.name || "").trim(),
            pole: pole,
            createdAt: existing ? existing.createdAt : nowISO()
        };
        if (!contact.phone || !contact.name) return null;
        U.active.upsertContact(contact);
        return contact;
    };
    store.deleteContact = function (id) { U.active.deleteContact(id); };
    // Équipe (pôle) associée à un numéro.
    store.teamForPhone = function (phone) { var c = store.contactForPhone(phone); return (c && c.pole && store.data.poles[c.pole]) ? store.data.poles[c.pole] : null; };

    /* --------- Comptes rendus (synthèses IA) --------- */
    store.reportsArray = function () {
        return Object.keys(store.data.reports).map(function (k) { return store.data.reports[k]; })
            .sort(function (a, b) { return String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")); });
    };
    store.report = function (id) { return store.data.reports[id] || null; };
    store.deleteReport = function (id) { U.active.deleteReport(id); };

    /* --------- Conversations WhatsApp (journal des échanges) --------- */
    store.conversationsArray = function () {
        return Object.keys(store.data.conversations).map(function (k) { return store.data.conversations[k]; })
            .sort(function (a, b) { return String(a.at || "").localeCompare(String(b.at || "")); });
    };
    // Regroupe les messages par numéro (fil de discussion), fils les plus récents d'abord.
    store.conversationThreads = function () {
        var byPhone = {};
        store.conversationsArray().forEach(function (m) {
            var key = m.phone || m.id;
            if (!byPhone[key]) byPhone[key] = { phone: m.phone, name: "", messages: [] };
            byPhone[key].messages.push(m);
            if (m.name && m.direction === "in") byPhone[key].name = m.name; // nom fourni par l'entrant
        });
        var threads = Object.keys(byPhone).map(function (k) {
            var t = byPhone[k];
            var contact = store.contactForPhone(t.phone);
            t.name = (contact && contact.name) || t.name || t.phone || "Inconnu";
            t.pole = (contact && contact.pole && store.data.poles[contact.pole]) ? store.data.poles[contact.pole] : null;
            t.last = t.messages[t.messages.length - 1];
            return t;
        });
        threads.sort(function (a, b) { return String((b.last || {}).at || "").localeCompare(String((a.last || {}).at || "")); });
        return threads;
    };
    store.deleteConversationThread = function (phone) {
        store.conversationsArray().forEach(function (m) { if ((m.phone || "") === phone) U.active.deleteConversation(m.id); });
    };

    /* --------- Boîte de réception (messages WhatsApp interprétés par l'IA) --------- */
    store.inboxArray = function () {
        return Object.keys(store.data.inbox).map(function (k) { return store.data.inbox[k]; })
            .sort(function (a, b) { return String(b.receivedAt || b.createdAt || "").localeCompare(String(a.receivedAt || a.createdAt || "")); });
    };
    store.inboxItem = function (id) { return store.data.inbox[id] || null; };
    store.inboxPending = function () { return store.inboxArray().filter(function (m) { return (m.status || "pending") === "pending"; }); };
    store.inboxPendingCount = function () { return store.inboxPending().length; };
    // Nom lisible de l'expéditeur (via les contacts, sinon nom brut, sinon numéro).
    store.inboxSenderName = function (m) {
        var from = m.from || {};
        var c = store.contactForPhone(from.phone);
        return (c && c.name) || from.name || from.phone || "Inconnu";
    };
    store.setInboxStatus = function (id, status) {
        var m = store.inboxItem(id); if (!m) return;
        var updated = Object.assign({}, m, { status: status, updatedAt: nowISO() });
        if (status === "applied") updated.appliedAt = nowISO();
        U.active.upsertInbox(updated);
    };
    store.deleteInboxItem = function (id) { U.active.deleteInbox(id); };

    // Applique la proposition IA d'un message selon son intention, puis marque « appliqué ».
    // `overrides` permet à l'UI de corriger les champs avant application.
    store.applyInboxItem = function (id, overrides) {
        var m = store.inboxItem(id); if (!m) return null;
        var ai = m.ai || {};
        var proposed = Object.assign({}, ai.proposed || {}, overrides || {});
        var intent = (overrides && overrides.intent) || ai.intent || "unknown";
        var senderContact = store.contactForPhone((m.from || {}).phone);
        var assignee = proposed.assignee || (senderContact && senderContact.name) || null;
        var result = null;

        if (intent === "update_chantier" && ai.chantierId && store.chantier(ai.chantierId)) {
            var c = store.chantier(ai.chantierId);
            var note = proposed.note || m.rawText;
            result = store.saveChantier({
                id: c.id, nom: c.nom, pole: c.pole,
                statut: (proposed.statut && U.STATUSES[proposed.statut]) ? proposed.statut : c.statut,
                priorite: (proposed.priority && U.PRIORITIES[proposed.priority]) ? proposed.priority : c.priorite,
                responsable: proposed.assignee || c.responsable,
                deadline: proposed.deadline || c.deadline,
                progression: (proposed.progression != null) ? proposed.progression : c.progression,
                notes: note ? ((c.notes ? c.notes + "\n" : "") + note) : c.notes
            });
        } else if (intent === "new_task") {
            result = store.saveDailyTask({
                title: proposed.taskTitle || proposed.title || m.rawText || "Tâche",
                priority: proposed.priority || null,
                due: proposed.deadline || proposed.due || null,
                assignee: assignee,
                chantier: (ai.chantierId && store.chantier(ai.chantierId)) ? ai.chantierId : null
            });
        } else if (intent === "note" && ai.chantierId && store.chantier(ai.chantierId)) {
            var cn = store.chantier(ai.chantierId);
            var txt = proposed.note || m.rawText || "";
            result = store.saveChantier({ id: cn.id, nom: cn.nom, pole: cn.pole, notes: (cn.notes ? cn.notes + "\n" : "") + txt });
        } else {
            return null; // non applicable automatiquement → l'UI doit passer par « Modifier »
        }
        store.setInboxStatus(id, "applied");
        return result;
    };

    // Export brut de l'état courant.
    store.exportData = function () {
        return {
            app: "ultra-macro",
            version: U.SCHEMA_VERSION,
            exportedAt: nowISO(),
            poles: store.data.poles,
            chantiers: store.data.chantiers,
            objectives: store.data.objectives,
            dailysections: store.data.dailysections,
            dailytasks: store.data.dailytasks,
            inbox: store.data.inbox,
            contacts: store.data.contacts,
            reports: store.data.reports,
            conversations: store.data.conversations
        };
    };

    U.store = store;

})(window.Ultra);
