/* =========================================================
   Ultra Macro — Rendu des vues
   Dashboard (priorités par pôle) · Kanban · Timeline échéances
   ========================================================= */
(function (U) {
    "use strict";

    var views = {};
    function $(id) { return document.getElementById(id); }
    var S = U.STATUSES, P = U.PRIORITIES;

    /* --------- Recherche --------- */
    function matches(c, q) {
        if (!q) return true;
        q = q.toLowerCase();
        var pole = U.store.pole(c.pole);
        return (c.nom || "").toLowerCase().indexOf(q) !== -1
            || (c.responsable || "").toLowerCase().indexOf(q) !== -1
            || (c.notes || "").toLowerCase().indexOf(q) !== -1
            || (pole && pole.name.toLowerCase().indexOf(q) !== -1);
    }

    /* --------- Fragments réutilisables --------- */
    function dateBadge(c) {
        if (!c.deadline) return "";
        var cls = c.statut === "termine" ? "done" : U.urgencyClass(c);
        return '<span class="badge-date ' + cls + '"><i class="fa-regular fa-clock"></i> ' + U.escape(U.relativeLabel(c.deadline)) + "</span>";
    }
    // Bloc responsable : nom complet (avec icône), tronqué proprement si très long.
    function respLine(name) {
        if (!name) return "";
        return '<div class="cc-resp" title="' + U.escape(name) + '"><i class="fa-regular fa-user"></i><span>' + U.escape(name) + "</span></div>";
    }

    /* ============================================================
       VUE DASHBOARD
       ============================================================ */
    views.renderDashboard = function () {
        renderKPIs();
        renderPolesGrid();
    };

    var KPI_ITEMS = [
        { key: "total",   label: "Total chantiers", color: "var(--faint)",   icon: "fa-solid fa-layer-group",  neutral: true },
        { key: "prevu",   label: "À venir",         color: "var(--prevu)",   icon: "fa-regular fa-calendar" },
        { key: "encours", label: "En cours",        color: "var(--encours)", icon: "fa-solid fa-spinner" },
        { key: "termine", label: "Terminés",        color: "var(--termine)", icon: "fa-solid fa-check-double" }
    ];
    var kpiBuilt = false;

    function renderKPIs() {
        var k = U.store.kpis();
        if (!kpiBuilt) {
            $("kpiRow").innerHTML = KPI_ITEMS.map(function (i) {
                return '<div class="kpi" style="--kpi-c:' + i.color + '">' +
                    '<div class="kpi-label"><i class="' + i.icon + '"></i>' + i.label + "</div>" +
                    '<div class="kpi-value' + (i.neutral ? " neutral" : "") + '" id="kpi-' + i.key + '" data-v="0">0</div></div>';
            }).join("");
            kpiBuilt = true;
        }
        KPI_ITEMS.forEach(function (i) { animateCount($("kpi-" + i.key), k[i.key]); });
    }

    // Compteur animé (de l'ancienne valeur vers la nouvelle) — un peu de vie sur les KPIs.
    function animateCount(el, to) {
        if (!el) return;
        var from = Number(el.getAttribute("data-v")) || 0;
        to = Number(to) || 0;
        el.setAttribute("data-v", to);
        if (from === to) { el.textContent = to; return; }
        var start = null, dur = 520;
        function step(ts) {
            if (start === null) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(from + (to - from) * eased);
            if (p < 1) requestAnimationFrame(step); else el.textContent = to;
        }
        requestAnimationFrame(step);
    }

    function renderPolesGrid() {
        var q = U.viewState.search;
        var poles = U.store.polesArray(U.viewState.poleSort);
        var grid = $("polesGrid");
        $("polesEmpty").hidden = poles.length > 0;
        grid.hidden = poles.length === 0;

        grid.innerHTML = poles.map(function (p) {
            var color = U.themeColor(p.theme);
            var stats = U.store.poleStats(p.id);
            var focus = U.store.poleFocus(p.id, 8).filter(function (c) { return matches(c, q); });
            var shown = focus.slice(0, 4);

            var focusHTML;
            if (shown.length) {
                focusHTML = shown.map(function (c) {
                    var prio = P[c.priorite] || P[U.DEFAULT_PRIORITY];
                    var when = c.deadline ? '<span class="focus-when ' + U.urgencyClass(c) + '">' + U.escape(U.relativeLabel(c.deadline)) + "</span>" : "";
                    return '<div class="focus-row" data-act="edit-chantier" data-cid="' + c.id + '">' +
                        '<span class="prio-dot" style="background:' + prio.color + '" title="Priorité ' + prio.label + '"></span>' +
                        '<span class="focus-name">' + U.escape(c.nom) + "</span>" + when + "</div>";
                }).join("");
            } else if (stats.total === 0) {
                focusHTML = '<div class="focus-empty">Aucun chantier</div>';
            } else if (q) {
                focusHTML = '<div class="focus-empty">Aucun résultat</div>';
            } else {
                focusHTML = '<div class="focus-empty"><i class="fa-solid fa-check" style="color:var(--termine)"></i> Rien en cours</div>';
            }

            return '<div class="pole-card" style="--pole:' + color + '">' +
                '<button class="icon-btn pole-gear" data-act="edit-pole" data-id="' + p.id + '" title="Configurer"><i class="fa-solid fa-gear"></i></button>' +
                '<div class="pole-top">' +
                    '<div class="pole-ico"><i class="fa-solid fa-' + U.escape(p.icon) + '"></i></div>' +
                    '<div class="pole-meta"><div class="pole-name">' + U.escape(p.name) + "</div>" +
                    '<div class="pole-sub">' + stats.total + " chantiers · " + U.store.poleActiveCount(p.id) + " actifs</div></div>" +
                "</div>" +
                '<div class="pole-focus-label"><i class="fa-solid fa-bolt"></i> Priorités</div>' +
                '<div class="pole-focus">' + focusHTML + "</div>" +
                '<div class="pole-foot">' +
                    '<div class="pole-stats-line">' +
                        '<div class="mini-stat prevu"><div class="n">' + stats.prevu + '</div><div class="l">À venir</div></div>' +
                        '<div class="mini-stat encours"><div class="n">' + stats.encours + '</div><div class="l">En cours</div></div>' +
                        '<div class="mini-stat termine"><div class="n">' + stats.termine + '</div><div class="l">Terminés</div></div>' +
                    "</div>" +
                    '<div class="progress-head"><span>Progression</span><span>' + stats.progress + '%</span></div>' +
                    '<div class="progress-track"><div class="progress-fill" style="width:' + stats.progress + '%"></div></div>' +
                    '<button class="btn btn-ghost pole-open" data-act="open-pole" data-id="' + p.id + '">Ouvrir le pôle <i class="fa-solid fa-arrow-right"></i></button>' +
                "</div>" +
            "</div>";
        }).join("");
    }

    /* ============================================================
       VUE KANBAN (détail pôle)
       ============================================================ */
    views.renderKanban = function () {
        var poleId = U.viewState.pole;
        var pole = U.store.pole(poleId);
        if (!pole) { U.nav("dashboard"); return; }
        var color = U.themeColor(pole.theme);

        $("detailIcon").innerHTML = '<i class="fa-solid fa-' + U.escape(pole.icon) + '"></i>';
        $("view-pole").style.setProperty("--pole", color);
        $("detailIcon").style.setProperty("--pole", color);
        $("detailTitle").textContent = pole.name;

        var q = U.viewState.search;
        var all = U.store.chantiersOfPole(poleId);
        var visible = all.filter(function (c) { return matches(c, q); });
        $("detailStats").textContent = all.length + " chantier" + (all.length > 1 ? "s" : "") + " · " + U.store.poleActiveCount(poleId) + " actifs";
        $("detailEditPole").onclick = function () { U.ui.openPole(poleId); };

        $("kanban").innerHTML = kanbanColumnsHTML(visible, { showPole: false });
    };

    // Vue Kanban générale : tous les chantiers, tous pôles confondus.
    views.renderKanbanGlobal = function () {
        var q = U.viewState.search;
        var list = U.store.chantiersArray().filter(function (c) { return matches(c, q); });
        $("kanbanGlobal").innerHTML = kanbanColumnsHTML(list, { showPole: true });
    };

    function faIcon(cls) { return cls.replace("fa-solid ", "").replace("fa-regular ", ""); }

    // Génère les 3 colonnes de statut à partir d'une liste de chantiers.
    function kanbanColumnsHTML(list, opts) {
        return U.STATUS_ORDER.map(function (st) {
            var cards = U.store.sortByFocus(list.filter(function (c) { return c.statut === st; }));
            var body = cards.length
                ? cards.map(function (c) { return cardHTML(c, opts); }).join("")
                : '<div class="kcol-empty">Déposez un chantier ici</div>';
            return '<div class="kcol ' + st + '" data-status="' + st + '">' +
                '<div class="kcol-head"><span class="kcol-title"><i class="fa-solid ' + faIcon(S[st].icon) + '"></i>' + S[st].label + "</span>" +
                '<span class="kcol-count">' + cards.length + "</span></div>" +
                '<div class="kcol-body" data-status="' + st + '">' + body + "</div></div>";
        }).join("");
    }

    function cardHTML(c, opts) {
        opts = opts || {};
        var prio = P[c.priorite] || P[U.DEFAULT_PRIORITY];
        var pole = U.store.pole(c.pole);
        var poleColor = pole ? U.themeColor(pole.theme) : "var(--faint)";
        var progress = c.statut === "termine" ? 100 : (Number(c.progression) || 0);
        var progressHTML = (progress > 0 && c.statut !== "termine")
            ? '<div class="cc-progress"><div style="width:' + progress + '%"></div></div>' : "";
        var notes = c.notes ? '<div class="cc-notes">' + U.escape(c.notes) + "</div>" : "";
        var poleTag = (opts.showPole && pole)
            ? '<button class="cc-pole" data-act="open-pole" data-id="' + pole.id + '" style="--pole:' + poleColor + '"><i class="fa-solid fa-' + U.escape(pole.icon) + '"></i>' + U.escape(pole.name) + "</button>"
            : "";
        return '<div class="chantier-card" draggable="true" data-cid="' + c.id + '" style="--prio:' + prio.color + '; --pole:' + poleColor + '">' +
            '<div class="cc-top"><div class="cc-name">' + U.escape(c.nom) + "</div>" +
                '<span class="cc-prio" title="Priorité ' + prio.label + '">' + prio.label + "</span></div>" +
            poleTag + notes + progressHTML + respLine(c.responsable) +
            '<div class="cc-foot"><div class="cc-left">' + dateBadge(c) + "</div>" +
                '<div class="cc-actions">' +
                    '<button class="cc-act" data-act="edit-chantier" data-cid="' + c.id + '" title="Modifier"><i class="fa-solid fa-pen"></i></button>' +
                    '<button class="cc-act del" data-act="delete-chantier" data-cid="' + c.id + '" title="Supprimer"><i class="fa-solid fa-trash"></i></button>' +
                "</div></div></div>";
    }

    /* ============================================================
       VUE TIMELINE / ÉCHÉANCES
       ============================================================ */
    var GROUPS = [
        { key: "late",  label: "En retard",     cls: "late",  test: function (n, st) { return st !== "termine" && n < 0; } },
        { key: "week",  label: "Cette semaine", cls: "",      test: function (n, st) { return st !== "termine" && n >= 0 && n <= 7; } },
        { key: "month", label: "Ce mois-ci",    cls: "",      test: function (n, st) { return st !== "termine" && n > 7 && n <= 31; } },
        { key: "later", label: "Plus tard",     cls: "",      test: function (n, st) { return st !== "termine" && n > 31; } },
        { key: "done",  label: "Terminés",      cls: "",      test: function (n, st) { return st === "termine"; } }
    ];

    views.renderTimeline = function () {
        var q = U.viewState.search;
        var filter = U.viewState.calFilter;
        var list = U.store.chantiersArray().filter(function (c) {
            return c.deadline && matches(c, q) && (filter !== "active" || c.statut !== "termine");
        });

        var buckets = {};
        list.forEach(function (c) {
            var n = U.daysUntil(c.deadline);
            var g = GROUPS.find(function (grp) { return grp.test(n, c.statut); });
            if (!g) return;
            (buckets[g.key] = buckets[g.key] || []).push(c);
        });

        var html = GROUPS.map(function (g) {
            if (filter === "active" && g.key === "done") return "";
            var items = buckets[g.key];
            if (!items || !items.length) return "";
            items.sort(function (a, b) { return U.daysUntil(a.deadline) - U.daysUntil(b.deadline); });
            var rows = items.map(timelineRow).join("");
            return '<div class="tl-group ' + g.cls + '"><div class="tl-group-head"><h3>' + g.label +
                '</h3><span class="cnt">' + items.length + "</span></div>" +
                '<div class="tl-list">' + rows + "</div></div>";
        }).join("");

        $("timeline").innerHTML = html || '<div class="empty-state"><i class="fa-regular fa-calendar-check"></i><p>Aucune échéance à afficher.</p></div>';
    };

    function timelineRow(c) {
        var d = U.parseDate(c.deadline);
        var pole = U.store.pole(c.pole);
        var color = pole ? U.themeColor(pole.theme) : "var(--faint)";
        var st = S[c.statut];
        return '<div class="tl-row" data-act="edit-chantier" data-cid="' + c.id + '">' +
            '<div class="tl-date"><div class="d">' + d.getDate() + '</div><div class="m">' + d.toLocaleDateString("fr-FR", { month: "short" }) + "</div></div>" +
            '<div class="tl-bar" style="background:' + color + '"></div>' +
            '<div class="tl-main"><div class="tl-name">' + U.escape(c.nom) + "</div>" +
                '<div class="tl-sub">' + (pole ? '<span class="tl-pole-tag" style="--pole:' + color + '"><i class="fa-solid fa-' + U.escape(pole.icon) + '"></i>' + U.escape(pole.name) + "</span>" : "") +
                (c.responsable ? "<span>· " + U.escape(c.responsable) + "</span>" : "") +
                "<span>· " + U.escape(U.relativeLabel(c.deadline)) + "</span></div></div>" +
            '<div class="tl-right"><span class="tl-status ' + c.statut + '">' + st.label + "</span></div></div>";
    }

    /* ============================================================
       Rendu global (appelé sur chaque changement du store)
       ============================================================ */
    views.render = function () {
        var v = U.viewState.current;
        if (v === "dashboard") views.renderDashboard();
        else if (v === "pole") views.renderKanban();
        else if (v === "kanban") views.renderKanbanGlobal();
        else if (v === "calendar") views.renderTimeline();
    };

    /* --------- Délégation d'événements --------- */
    function actionFromEvent(e) {
        var el = e.target.closest("[data-act]");
        return el ? { act: el.dataset.act, id: el.dataset.id, cid: el.dataset.cid } : null;
    }
    function handleAction(e) {
        var a = actionFromEvent(e); if (!a) return;
        if (a.act === "open-pole") U.nav("pole", a.id);
        else if (a.act === "edit-pole") U.ui.openPole(a.id);
        else if (a.act === "edit-chantier") U.ui.openChantier(a.cid);
        else if (a.act === "delete-chantier") { e.stopPropagation(); U.ui.deleteChantierFlow(a.cid); }
    }

    /* --------- Glisser-déposer Kanban (par pôle + général) --------- */
    var dragId = null;
    function bindDnD(box) {
        box.addEventListener("dragstart", function (e) {
            var card = e.target.closest(".chantier-card"); if (!card) return;
            dragId = card.dataset.cid; card.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", dragId); } catch (err) {}
        });
        box.addEventListener("dragend", function (e) {
            var card = e.target.closest(".chantier-card"); if (card) card.classList.remove("dragging");
            box.querySelectorAll(".drop-hover").forEach(function (c) { c.classList.remove("drop-hover"); });
            dragId = null;
        });
        box.addEventListener("dragover", function (e) {
            var col = e.target.closest(".kcol"); if (!col) return;
            e.preventDefault(); e.dataTransfer.dropEffect = "move";
            box.querySelectorAll(".drop-hover").forEach(function (c) { if (c !== col) c.classList.remove("drop-hover"); });
            col.classList.add("drop-hover");
        });
        box.addEventListener("dragleave", function (e) {
            var col = e.target.closest(".kcol");
            if (col && !col.contains(e.relatedTarget)) col.classList.remove("drop-hover");
        });
        box.addEventListener("drop", function (e) {
            var col = e.target.closest(".kcol"); if (!col) return;
            e.preventDefault();
            col.classList.remove("drop-hover");
            var id = dragId || e.dataTransfer.getData("text/plain");
            if (id) {
                var c = U.store.chantier(id);
                if (c && c.statut !== col.dataset.status) {
                    U.store.setStatus(id, col.dataset.status);
                    U.ui.toast("Déplacé vers « " + S[col.dataset.status].label + " »", "info");
                }
            }
            dragId = null;
        });
    }

    views.init = function () {
        ["polesGrid", "kanban", "kanbanGlobal", "timeline"].forEach(function (id) {
            $(id).addEventListener("click", handleAction);
        });
        bindDnD($("kanban"));
        bindDnD($("kanbanGlobal"));
    };

    U.views = views;

})(window.Ultra);
