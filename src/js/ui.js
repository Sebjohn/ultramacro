/* =========================================================
   Ultra Macro — UI : toasts, modales, formulaires, réglages
   ========================================================= */
(function (U) {
    "use strict";

    var ui = {};
    function $(id) { return document.getElementById(id); }

    /* ===================== TOASTS ===================== */
    ui.toast = function (msg, type) {
        type = type || "info";
        var stack = $("toastStack");
        var el = document.createElement("div");
        el.className = "toast " + type;
        var icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
        el.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + U.escape(msg) + "</span>";
        stack.appendChild(el);
        setTimeout(function () {
            el.classList.add("out");
            setTimeout(function () { el.remove(); }, 250);
        }, 3200);
    };

    /* ===================== SYNC STATUS ===================== */
    var lastSaved = null;
    ui.syncStatus = function (mode, state, msg) {
        var chip = $("syncChip"), label = $("syncLabel");
        if (!chip) return;
        chip.classList.toggle("is-cloud", mode === "cloud");
        chip.classList.remove("is-saving", "is-error");
        if (state === "saving") chip.classList.add("is-saving");
        if (state === "error") chip.classList.add("is-error");

        if (state === "saved") lastSaved = new Date();
        var base = mode === "cloud" ? "Cloud" : "Local";
        if (state === "saving") label.textContent = "Sync…";
        else if (state === "error") label.textContent = "Erreur";
        else label.textContent = base;
        chip.title = msg || (base + (lastSaved ? " · enregistré " + lastSaved.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""));

        // Reflet dans les réglages
        var sm = $("storageMode");
        if (sm) { sm.textContent = base; sm.classList.toggle("cloud", mode === "cloud"); }
    };

    /* ===================== MODALES ===================== */
    ui.openModal = function (id) {
        var el = $(id);
        el.hidden = false;
        requestAnimationFrame(function () { el.classList.add("is-open"); });
        var focusable = el.querySelector("input, select, textarea, button");
        if (focusable) setTimeout(function () { focusable.focus(); }, 60);
    };
    ui.closeModal = function (id) {
        var el = $(id);
        el.classList.remove("is-open");
        setTimeout(function () { el.hidden = true; }, 200);
    };
    ui.closeAllModals = function () {
        document.querySelectorAll(".modal-backdrop").forEach(function (m) {
            if (!m.hidden) { m.classList.remove("is-open"); setTimeout(function () { m.hidden = true; }, 200); }
        });
    };

    /* ===================== CONFIRM ===================== */
    ui.confirm = function (text, opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            $("confirmTitle").textContent = opts.title || "Confirmer ?";
            $("confirmText").textContent = text || "";
            var ok = $("confirmOk"), cancel = $("confirmCancel");
            ok.textContent = opts.okLabel || "Confirmer";
            ok.className = "btn " + (opts.danger === false ? "btn-primary" : "btn-danger");
            ui.openModal("confirmModal");
            function cleanup(v) { ok.onclick = null; cancel.onclick = null; ui.closeModal("confirmModal"); resolve(v); }
            ok.onclick = function () { cleanup(true); };
            cancel.onclick = function () { cleanup(false); };
        });
    };

    /* ===================== SELECT HELPERS ===================== */
    function fillSelect(el, entries, current) {
        el.innerHTML = entries.map(function (e) {
            return '<option value="' + e.value + '"' + (e.value === current ? " selected" : "") + ">" + U.escape(e.label) + "</option>";
        }).join("");
    }
    function poleOptions() {
        return U.store.polesArray().map(function (p) { return { value: p.id, label: p.name }; });
    }
    function statusOptions() {
        return U.STATUS_ORDER.map(function (k) { return { value: k, label: U.STATUSES[k].label }; });
    }
    function priorityOptions() {
        return U.PRIORITY_ORDER.map(function (k) { return { value: k, label: U.PRIORITIES[k].label }; });
    }
    // Liste déroulante des responsables (générique, réutilisée par chantier & pôle) :
    // « non assigné » + connus + « nouveau… ». `sel` = l'élément <select>.
    function fillRespSelect(sel, current) {
        var names = U.store.responsables();
        if (current && names.indexOf(current) === -1) { names.push(current); names.sort(function (a, b) { return a.localeCompare(b, "fr"); }); }
        var opts = ['<option value="">— Non assigné —</option>'];
        names.forEach(function (n) {
            opts.push('<option value="' + U.escape(n) + '"' + (n === current ? " selected" : "") + ">" + U.escape(n) + "</option>");
        });
        opts.push('<option value="__new__">➕ Nouveau responsable…</option>');
        sel.innerHTML = opts.join("");
        var nf = sel.parentElement.querySelector(".resp-new");
        if (nf) { nf.hidden = true; nf.value = ""; }
    }
    // Valeur retenue : soit l'option choisie, soit le nom saisi via « nouveau… ».
    function readRespSelect(sel) {
        var nf = sel.parentElement.querySelector(".resp-new");
        return sel.value === "__new__" ? (nf ? nf.value : "") : sel.value;
    }

    /* ===================== MODAL CHANTIER ===================== */
    ui.openChantier = function (id) {
        var editing = id ? U.store.chantier(id) : null;
        $("chantierForm").dataset.editing = editing ? editing.id : "";
        $("chantierModalTitle").innerHTML = editing
            ? '<i class="fa-solid fa-pen"></i> Modifier le chantier'
            : '<i class="fa-solid fa-plus-circle"></i> Nouveau chantier';

        var selectedPole = editing ? editing.pole : (U.viewState.pole || (poleOptions()[0] || {}).value);
        fillSelect($("fPole"), poleOptions(), selectedPole);
        fillSelect($("fStatut"), statusOptions(), editing ? editing.statut : "prevu");
        fillSelect($("fPriorite"), priorityOptions(), editing ? editing.priorite : U.DEFAULT_PRIORITY);

        $("fNom").value = editing ? editing.nom : "";
        // Nouveau chantier : pré-remplit avec l'assigné par défaut du pôle sélectionné.
        var respCurrent;
        if (editing) { respCurrent = editing.responsable || ""; }
        else { var pdef = U.store.pole(selectedPole); respCurrent = (pdef && pdef.defaultResponsable) ? pdef.defaultResponsable : ""; }
        fillRespSelect($("fRespSelect"), respCurrent);
        $("fDeadline").value = editing && editing.deadline ? editing.deadline : "";
        $("fNotes").value = editing && editing.notes ? editing.notes : "";
        var prog = editing ? editing.progression : 0;
        $("fProgress").value = prog; $("fProgressVal").textContent = prog;

        $("chantierDelete").hidden = !editing;
        if (!poleOptions().length) {
            ui.toast("Créez d'abord un pôle", "error");
            return;
        }
        ui.openModal("chantierModal");
    };

    function submitChantier(e) {
        e.preventDefault();
        var id = $("chantierForm").dataset.editing || null;
        var responsable = readRespSelect($("fRespSelect"));
        var res = U.store.saveChantier({
            id: id,
            nom: $("fNom").value,
            pole: $("fPole").value,
            statut: $("fStatut").value,
            priorite: $("fPriorite").value,
            responsable: responsable,
            deadline: $("fDeadline").value,
            progression: $("fProgress").value,
            notes: $("fNotes").value
        });
        if (!res) { ui.toast("Nom et pôle sont requis", "error"); return; }
        ui.closeModal("chantierModal");
        ui.toast(id ? "Chantier mis à jour" : "Chantier créé", "success");
    }

    ui.deleteChantierFlow = function (id) {
        var c = U.store.chantier(id);
        if (!c) return;
        ui.confirm('Supprimer « ' + c.nom + " » ?", { title: "Supprimer le chantier", okLabel: "Supprimer" })
            .then(function (ok) { if (ok) { U.store.deleteChantier(id); ui.closeModal("chantierModal"); ui.toast("Chantier supprimé", "info"); } });
    };

    /* ===================== MODAL PÔLE ===================== */
    var poleFormTheme = "indigo";
    var poleFormIcon = "folder";

    function renderThemePicker() {
        var wrap = $("themePicker");
        wrap.innerHTML = U.THEME_ORDER.map(function (name) {
            var c = U.themeColor(name);
            return '<button type="button" class="theme-swatch' + (name === poleFormTheme ? " is-active" : "") +
                '" data-theme="' + name + '" style="background:' + c + '" title="' + name + '"></button>';
        }).join("");
        wrap.querySelectorAll(".theme-swatch").forEach(function (b) {
            b.onclick = function () { poleFormTheme = b.dataset.theme; renderThemePicker(); updateIconPreview(); };
        });
    }
    function renderIconPicker() {
        var wrap = $("iconPicker");
        wrap.innerHTML = U.ICON_SUGGESTIONS.map(function (name) {
            return '<button type="button" class="icon-opt' + (name === poleFormIcon ? " is-active" : "") +
                '" data-icon="' + name + '" title="' + name + '"><i class="fa-solid fa-' + name + '"></i></button>';
        }).join("");
        wrap.querySelectorAll(".icon-opt").forEach(function (b) {
            b.onclick = function () { poleFormIcon = b.dataset.icon; $("fPoleIcon").value = poleFormIcon; renderIconPicker(); updateIconPreview(); };
        });
    }
    function updateIconPreview() {
        var name = ($("fPoleIcon").value || poleFormIcon || "folder").replace(/^fa-/, "");
        $("poleIconPreview").innerHTML = '<i class="fa-solid fa-' + U.escape(name) + '" style="color:' + U.themeColor(poleFormTheme) + '"></i>';
    }

    ui.openPole = function (id) {
        var editing = id ? U.store.pole(id) : null;
        $("poleForm").dataset.editing = editing ? editing.id : "";
        $("poleModalTitle").innerHTML = editing
            ? '<i class="fa-solid fa-sliders"></i> Configurer le pôle'
            : '<i class="fa-solid fa-folder-plus"></i> Nouveau pôle';
        $("fPoleName").value = editing ? editing.name : "";
        fillRespSelect($("fPoleRespSelect"), editing && editing.defaultResponsable ? editing.defaultResponsable : "");
        poleFormTheme = editing ? editing.theme : "indigo";
        poleFormIcon = editing ? editing.icon : "folder";
        $("fPoleIcon").value = poleFormIcon;
        renderThemePicker();
        renderIconPicker();
        updateIconPreview();
        $("poleDelete").hidden = !editing;
        ui.openModal("poleModal");
    };

    function submitPole(e) {
        e.preventDefault();
        var id = $("poleForm").dataset.editing || null;
        var res = U.store.savePole({
            id: id,
            name: $("fPoleName").value,
            icon: $("fPoleIcon").value || poleFormIcon,
            theme: poleFormTheme,
            defaultResponsable: readRespSelect($("fPoleRespSelect"))
        });
        if (!res) { ui.toast("Le nom du pôle est requis", "error"); return; }
        ui.closeModal("poleModal");
        ui.toast(id ? "Pôle mis à jour" : "Pôle créé", "success");
    }

    ui.deletePoleFlow = function (id) {
        var p = U.store.pole(id);
        if (!p) return;
        var count = U.store.chantiersOfPole(id).length;
        if (count > 0) {
            ui.toast("Impossible : ce pôle contient encore " + count + " chantier(s)", "error");
            return;
        }
        ui.confirm('Supprimer le pôle « ' + p.name + " » ?", { title: "Supprimer le pôle", okLabel: "Supprimer" })
            .then(function (ok) {
                if (ok) { U.store.deletePole(id); ui.closeModal("poleModal"); if (U.viewState.pole === id) U.nav("dashboard"); ui.toast("Pôle supprimé", "info"); }
            });
    };

    /* ===================== MODAL OBJECTIF ===================== */
    ui.openObjective = function (id) {
        var editing = id ? U.store.objective(id) : null;
        $("objectiveForm").dataset.editing = editing ? editing.id : "";
        $("objectiveModalTitle").innerHTML = editing
            ? '<i class="fa-solid fa-bullseye"></i> Modifier l\'objectif'
            : '<i class="fa-solid fa-bullseye"></i> Nouvel objectif';
        var target = editing ? editing.target : 10;
        var current = editing ? editing.current : 0;
        $("fObjLabel").value = editing ? editing.label : "";
        $("fObjPeriod").value = editing ? editing.period : "month";
        $("fObjTarget").value = target;
        $("fObjCurrent").value = current;
        $("objectiveDelete").hidden = !editing;
        ui.openModal("objectiveModal");
    };

    function submitObjective(e) {
        e.preventDefault();
        var id = $("objectiveForm").dataset.editing || null;
        var res = U.store.saveObjective({
            id: id,
            label: $("fObjLabel").value,
            period: $("fObjPeriod").value,
            target: $("fObjTarget").value,
            current: $("fObjCurrent").value
        });
        if (!res) { ui.toast("L'intitulé de l'objectif est requis", "error"); return; }
        ui.closeModal("objectiveModal");
        ui.toast(id ? "Objectif mis à jour" : "Objectif créé", "success");
    }

    ui.deleteObjectiveFlow = function (id) {
        var o = U.store.objective(id); if (!o) return;
        ui.confirm('Supprimer l\'objectif « ' + o.label + " » ?", { title: "Supprimer l'objectif", okLabel: "Supprimer" })
            .then(function (ok) { if (ok) { U.store.deleteObjective(id); ui.closeModal("objectiveModal"); ui.toast("Objectif supprimé", "info"); } });
    };

    /* ===================== DAILY TASKS ===================== */
    ui.openDailyTask = function (id) {
        var editing = id ? U.store.dailyTask(id) : null;
        var form = $("dailyTaskForm");
        form.dataset.editing = editing ? editing.id : "";
        $("dailyTaskModalTitle").innerHTML = editing
            ? '<i class="fa-solid fa-list-check"></i> Modifier la tâche'
            : '<i class="fa-solid fa-list-check"></i> Nouvelle tâche';

        $("fTaskSection").innerHTML = '<option value="">Sans section</option>' +
            U.store.dailySectionsArray().map(function (s) {
                return '<option value="' + U.escape(s.id) + '">' + U.escape(s.name) + "</option>";
            }).join("");
        $("fTaskPriority").innerHTML = '<option value="">Aucune</option>' +
            U.PRIORITY_ORDER.map(function (k) { return '<option value="' + k + '">' + U.PRIORITIES[k].label + "</option>"; }).join("");
        $("fTaskAssignee").innerHTML = U.dailyOptions.assignee(editing && editing.assignee, "Non assigné");
        $("fTaskChantier").innerHTML = U.dailyOptions.chantier(editing && editing.chantier, "Aucun chantier");

        $("fTaskTitle").value = editing ? editing.title : "";
        $("fTaskSection").value = (editing && editing.section) ? editing.section : "";
        $("fTaskPriority").value = (editing && editing.priority) ? editing.priority : "";
        $("fTaskDue").value = (editing && editing.due) ? editing.due : "";
        $("fTaskAssignee").value = (editing && editing.assignee) ? editing.assignee : "";
        $("fTaskChantier").value = (editing && editing.chantier) ? editing.chantier : "";
        $("fTaskDone").checked = editing ? !!editing.done : false;
        $("fTaskNotes").value = (editing && editing.notes) ? editing.notes : "";
        $("dailyTaskDelete").hidden = !editing;
        ui.openModal("dailyTaskModal");
        setTimeout(function () { $("fTaskTitle").focus(); }, 30);
    };

    function submitDailyTask(e) {
        e.preventDefault();
        var id = $("dailyTaskForm").dataset.editing || null;
        var res = U.store.saveDailyTask({
            id: id,
            title: $("fTaskTitle").value,
            section: $("fTaskSection").value || null,
            priority: $("fTaskPriority").value || null,
            due: $("fTaskDue").value || null,
            assignee: $("fTaskAssignee").value || null,
            chantier: $("fTaskChantier").value || null,
            notes: $("fTaskNotes").value,
            done: $("fTaskDone").checked
        });
        if (!res) { ui.toast("Le titre de la tâche est requis", "error"); return; }
        ui.closeModal("dailyTaskModal");
        ui.toast(id ? "Tâche mise à jour" : "Tâche créée", "success");
    }

    ui.deleteDailyTaskFlow = function (id) {
        var t = U.store.dailyTask(id); if (!t) return;
        ui.confirm('Supprimer la tâche « ' + t.title + " » ?", { title: "Supprimer la tâche", okLabel: "Supprimer" })
            .then(function (ok) { if (ok) { U.store.deleteDailyTask(id); ui.closeModal("dailyTaskModal"); ui.toast("Tâche supprimée", "info"); } });
    };

    ui.deleteDailySectionFlow = function (id) {
        var s = U.store.dailySection(id); if (!s) return;
        var n = U.store.dailyTasksOfSection(id).length;
        var msg = n
            ? "Supprimer la section « " + s.name + " » ? Ses " + n + " tâche(s) repasseront « sans section »."
            : "Supprimer la section « " + s.name + " » ?";
        ui.confirm(msg, { title: "Supprimer la section", okLabel: "Supprimer" })
            .then(function (ok) { if (ok) { U.store.deleteDailySection(id); ui.toast("Section supprimée", "info"); } });
    };

    /* ===================== RÉGLAGES ===================== */
    // Liste des assignés (avec nb de chantiers + suppression)
    function renderAssignees() {
        var names = U.store.responsables();
        var el = $("assigneesList");
        if (!names.length) { el.innerHTML = '<p class="muted small">Aucun assigné pour le moment.</p>'; return; }
        var chantiers = U.store.chantiersArray();
        el.innerHTML = names.map(function (n) {
            var count = chantiers.filter(function (c) { return c.responsable === n; }).length;
            return '<div class="assignee-row">' +
                '<span class="assignee-name">' + U.escape(n) + "</span>" +
                '<span class="assignee-count">' + count + " chantier" + (count > 1 ? "s" : "") + "</span>" +
                '<button class="icon-btn assignee-del" data-name="' + U.escape(n) + '" title="Retirer"><i class="fa-solid fa-trash"></i></button>' +
                "</div>";
        }).join("");
    }

    ui.openSettings = function () {
        renderAssignees();
        $("fbDbUrl").value = U.persistence.getDbUrl() || U.persistence.suggestedUrl;
        $("fbWorkspace").value = U.persistence.getWorkspace();
        var cloud = U.persistence.mode === "cloud";
        $("fbConnect").innerHTML = cloud ? '<i class="fa-solid fa-rotate"></i> Reconnecter' : '<i class="fa-solid fa-plug"></i> Connecter';
        $("fbDisconnect").hidden = !cloud;
        $("storageDesc").textContent = cloud
            ? "Vos chantiers sont synchronisés en temps réel dans la base Firebase. Ils sont partagés par tous ceux qui utilisent la même URL et le même espace de travail."
            : "Les données sont enregistrées dans ce navigateur. Connectez une base Realtime Database pour synchroniser entre appareils et avec votre équipe.";
        $("fbHint").textContent = "";
        ui.openModal("settingsModal");
    };

    function wireSettings() {
        $("assigneesList").addEventListener("click", function (e) {
            var b = e.target.closest(".assignee-del"); if (!b) return;
            var name = b.dataset.name;
            var count = U.store.chantiersArray().filter(function (c) { return c.responsable === name; }).length;
            var msg = count
                ? ("« " + name + " » sera désassigné de " + count + " chantier(s). Continuer ?")
                : ("Retirer « " + name + " » de la liste des assignés ?");
            ui.confirm(msg, { title: "Retirer un assigné", okLabel: "Retirer" }).then(function (ok) {
                if (!ok) return;
                var n = U.store.removeResponsable(name);
                renderAssignees();
                ui.toast("« " + name + " » retiré" + (n ? " (" + n + " chantier(s) désassigné(s))" : ""), "info");
            });
        });
        $("fbConnect").onclick = function () {
            var btn = this; btn.disabled = true;
            $("fbHint").textContent = "Connexion en cours…";
            U.persistence.connectCloud($("fbDbUrl").value, $("fbWorkspace").value)
                .then(function () {
                    btn.disabled = false;
                    ui.toast("Connecté à la base temps réel", "success");
                    ui.openSettings();
                })
                .catch(function (err) {
                    btn.disabled = false;
                    console.error(err);
                    $("fbHint").textContent = "Échec : " + (err && err.message ? err.message : "configuration invalide.");
                    ui.toast("Connexion Firebase impossible", "error");
                });
        };
        $("fbDisconnect").onclick = function () {
            ui.confirm("Revenir au stockage local ? Vos données actuelles seront copiées localement.", { title: "Déconnecter le cloud", okLabel: "Déconnecter", danger: false })
                .then(function (ok) { if (ok) { U.persistence.disconnectCloud(); ui.toast("Mode local rétabli", "info"); ui.openSettings(); } });
        };
        $("exportBtn").onclick = function () {
            var data = U.store.exportData();
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "ultra-macro-" + U.toInputDate(new Date()) + ".json";
            a.click();
            URL.revokeObjectURL(a.href);
            ui.toast("Export généré", "success");
        };
        $("importBtn").onclick = function () { $("importFile").click(); };
        $("importFile").onchange = function (e) {
            var file = e.target.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var data = JSON.parse(reader.result);
                    ui.confirm("Importer ces données ? Elles remplaceront les chantiers et pôles actuels.", { title: "Importer", okLabel: "Importer", danger: false })
                        .then(function (ok) { if (ok) { U.persistence.replaceAll(data); ui.toast("Données importées", "success"); } });
                } catch (err) { ui.toast("Fichier JSON invalide", "error"); }
                e.target.value = "";
            };
            reader.readAsText(file);
        };
    }

    /* ===================== INIT UI ===================== */
    ui.init = function () {
        $("chantierForm").addEventListener("submit", submitChantier);
        $("poleForm").addEventListener("submit", submitPole);
        $("chantierDelete").addEventListener("click", function () {
            var id = $("chantierForm").dataset.editing; if (id) ui.deleteChantierFlow(id);
        });
        $("poleDelete").addEventListener("click", function () {
            var id = $("poleForm").dataset.editing; if (id) ui.deletePoleFlow(id);
        });
        $("objectiveForm").addEventListener("submit", submitObjective);
        $("objectiveDelete").addEventListener("click", function () {
            var id = $("objectiveForm").dataset.editing; if (id) ui.deleteObjectiveFlow(id);
        });
        $("dailyTaskForm").addEventListener("submit", submitDailyTask);
        $("dailyTaskDelete").addEventListener("click", function () {
            var id = $("dailyTaskForm").dataset.editing; if (id) ui.deleteDailyTaskFlow(id);
        });
        $("fProgress").addEventListener("input", function () { $("fProgressVal").textContent = this.value; });
        // Affiche le champ de saisie quand on choisit « Nouveau responsable… » (les deux listes).
        ["fRespSelect", "fPoleRespSelect"].forEach(function (selId) {
            var sel = $(selId);
            sel.addEventListener("change", function () {
                var nf = sel.parentElement.querySelector(".resp-new");
                var isNew = sel.value === "__new__";
                if (nf) { nf.hidden = !isNew; if (isNew) setTimeout(function () { nf.focus(); }, 0); }
            });
        });
        // Changer de pôle (nouveau chantier) applique l'assigné par défaut de ce pôle.
        $("fPole").addEventListener("change", function () {
            if ($("chantierForm").dataset.editing) return;
            var p = U.store.pole(this.value);
            fillRespSelect($("fRespSelect"), (p && p.defaultResponsable) ? p.defaultResponsable : "");
        });
        $("fPoleIcon").addEventListener("input", function () { poleFormIcon = this.value.replace(/^fa-/, ""); updateIconPreview(); });

        // Fermer les modales : boutons [data-close], clic sur le fond, touche Échap.
        document.querySelectorAll("[data-close]").forEach(function (b) {
            b.addEventListener("click", function () { ui.closeModal(b.dataset.close); });
        });
        document.querySelectorAll(".modal-backdrop").forEach(function (bd) {
            bd.addEventListener("mousedown", function (e) { if (e.target === bd) ui.closeModal(bd.id); });
        });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") ui.closeAllModals(); });

        wireSettings();
    };

    U.ui = ui;

})(window.Ultra);
