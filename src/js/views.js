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
        renderObjectives();
        renderPolesGrid();
    };

    function renderObjectives() {
        var el = $("objectivesRow");
        if (!el) return;
        var objs = U.store.objectivesArray();
        if (!objs.length) {
            el.innerHTML = '<button class="obj-empty" data-act="new-objective">＋ Ajoutez un objectif hebdomadaire ou mensuel</button>';
            return;
        }
        el.innerHTML = objs.map(function (o) {
            var pct = o.target > 0 ? Math.min(100, Math.round(o.current / o.target * 100)) : 0;
            var periodLabel = o.period === "week" ? "Cette semaine" : "Ce mois";
            return '<button class="obj-card' + (pct >= 100 ? " done" : "") + '" data-act="edit-objective" data-oid="' + o.id + '">' +
                '<div class="obj-head"><span class="obj-label">' + U.escape(o.label) + "</span>" +
                '<span class="obj-period">' + periodLabel + "</span></div>" +
                '<div class="obj-track"><div class="obj-fill" style="width:' + pct + '%"></div></div>' +
                '<div class="obj-foot"><span class="obj-val">' + o.current + " / " + o.target + "</span>" +
                '<span class="obj-pct">' + pct + "%</span></div></button>";
        }).join("");
    }

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
        var manual = U.viewState.poleSort === "manual"; // réordonnable seulement en « Ordre défini »
        var grid = $("polesGrid");
        grid.classList.toggle("reorderable", manual);
        $("polesEmpty").hidden = poles.length > 0;
        grid.hidden = poles.length === 0;

        grid.innerHTML = poles.map(function (p) {
            var color = U.themeColor(p.theme);
            var stats = U.store.poleStats(p.id);
            var focus = U.store.poleFocus(p.id, 8).filter(function (c) { return matches(c, q); });
            var shown = focus.slice(0, 3);

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

            var owner = p.defaultResponsable
                ? '<div class="pole-owner" title="Assigné par défaut"><i class="fa-regular fa-user"></i>' + U.escape(p.defaultResponsable) + "</div>"
                : "";
            var recent = U.store.poleRecentDone(p.id, 2);
            var doneHTML = recent.length
                ? '<div class="pole-done-label">Terminé</div><div class="pole-done">' + recent.map(function (c) {
                    var dstr = String(U.store.doneDate(c)).slice(0, 10);
                    var when = dstr ? '<span class="done-when">' + U.escape(U.formatShort(dstr)) + "</span>" : "";
                    return '<div class="done-row" data-act="edit-chantier" data-cid="' + c.id + '"><i class="fa-solid fa-check"></i><span class="done-name">' + U.escape(c.nom) + "</span>" + when + "</div>";
                }).join("") + "</div>"
                : "";
            return '<div class="pole-card' + (manual ? " pole-drag" : "") + '" draggable="' + (manual ? "true" : "false") + '" data-pole="' + p.id + '" data-act="open-pole" data-id="' + p.id + '" style="--pole:' + color + '">' +
                (manual ? '<span class="pole-grip" title="Glisser pour réordonner"><i class="fa-solid fa-grip-vertical"></i></span>' : "") +
                '<button class="icon-btn pole-gear" data-act="edit-pole" data-id="' + p.id + '" title="Configurer"><i class="fa-solid fa-gear"></i></button>' +
                '<div class="pole-top">' +
                    '<div class="pole-ico"><i class="fa-solid fa-' + U.escape(p.icon) + '"></i></div>' +
                    '<div class="pole-meta"><div class="pole-name">' + U.escape(p.name) + "</div>" + owner +
                    '<div class="pole-sub">' + stats.total + " chantiers · " + U.store.poleActiveCount(p.id) + " actifs</div></div>" +
                "</div>" +
                '<div class="pole-focus-label">Priorités</div>' +
                '<div class="pole-focus">' + focusHTML + "</div>" +
                doneHTML +
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
    // Métadonnées d'affichage des groupes (ordre + libellé + style).
    var GROUPS = [
        { key: "late",  label: "En retard",     cls: "late" },
        { key: "today", label: "Aujourd'hui",   cls: "today" },
        { key: "week",  label: "Cette semaine", cls: "" },
        { key: "month", label: "Ce mois-ci",    cls: "" },
        { key: "later", label: "Plus tard",     cls: "" },
        { key: "done",  label: "Accompli",      cls: "done" }
    ];

    // Date de référence dans le calendrier : accomplissement pour un terminé, échéance sinon.
    function calRefDate(c) {
        return c.statut === "termine" ? String(U.store.doneDate(c)).slice(0, 10) : c.deadline;
    }
    function calGroup(c) {
        if (c.statut === "termine") return "done";
        var n = U.daysUntil(c.deadline);
        if (n < 0) return "late";
        if (n === 0) return "today";
        if (n <= 7) return "week";
        if (n <= 31) return "month";
        return "later";
    }

    views.renderTimeline = function () {
        var q = U.viewState.search;
        var filter = U.viewState.calFilter;
        var list = U.store.chantiersArray().filter(function (c) {
            if (!matches(c, q)) return false;
            if (c.statut === "termine") return filter !== "active" && !!calRefDate(c); // accomplis : uniquement en vue « Toutes »
            return !!c.deadline; // en cours / à venir : nécessitent une échéance
        });

        var buckets = {};
        list.forEach(function (c) {
            var g = calGroup(c);
            (buckets[g] = buckets[g] || []).push(c);
        });

        var html = GROUPS.map(function (g) {
            if (filter === "active" && g.key === "done") return "";
            var items = buckets[g.key];
            if (!items || !items.length) return "";
            if (g.key === "done") {
                items.sort(function (a, b) { return String(calRefDate(b)).localeCompare(String(calRefDate(a))); }); // plus récents d'abord
            } else {
                items.sort(function (a, b) { return U.daysUntil(a.deadline) - U.daysUntil(b.deadline); });
            }
            var rows = items.map(timelineRow).join("");
            var icon = g.key === "today" ? '<i class="fa-solid fa-calendar-day"></i> '
                : g.key === "late" ? '<i class="fa-solid fa-triangle-exclamation"></i> '
                : g.key === "done" ? '<i class="fa-solid fa-check-double"></i> ' : "";
            return '<div class="tl-group ' + g.cls + '"><div class="tl-group-head"><h3>' + icon + g.label +
                '</h3><span class="cnt">' + items.length + "</span></div>" +
                '<div class="tl-list">' + rows + "</div></div>";
        }).join("");

        $("timeline").innerHTML = html || '<div class="empty-state"><i class="fa-regular fa-calendar-check"></i><p>Aucune échéance à afficher.</p></div>';
    };

    function timelineRow(c) {
        var isDone = c.statut === "termine";
        var dateStr = calRefDate(c);
        var d = U.parseDate(dateStr) || U.parseDate((c.deadline || "").slice(0, 10)) || new Date();
        var pole = U.store.pole(c.pole);
        var color = pole ? U.themeColor(pole.theme) : "var(--faint)";
        var st = S[c.statut];
        var n = isDone ? null : U.daysUntil(c.deadline);
        var isToday = n === 0;
        var isLate = n !== null && n < 0;
        var rowCls = isDone ? " done" : (isToday ? " today" : (isLate ? " late" : ""));
        var when = isDone
            ? "Accompli le " + U.escape(U.formatShort(dateStr))
            : U.escape(U.relativeLabel(c.deadline));
        var right = isLate
            ? '<span class="tl-late">En retard de ' + Math.abs(n) + " j</span>"
            : (isToday ? '<span class="tl-today">Aujourd\'hui</span>' : "");
        return '<div class="tl-row' + rowCls + '" data-act="edit-chantier" data-cid="' + c.id + '">' +
            '<div class="tl-date"><div class="d">' + d.getDate() + '</div><div class="m">' + d.toLocaleDateString("fr-FR", { month: "short" }) + "</div></div>" +
            '<div class="tl-bar" style="background:' + color + '"></div>' +
            '<div class="tl-main"><div class="tl-name">' + U.escape(c.nom) + "</div>" +
                '<div class="tl-sub">' + (pole ? '<span class="tl-pole-tag" style="--pole:' + color + '"><i class="fa-solid fa-' + U.escape(pole.icon) + '"></i>' + U.escape(pole.name) + "</span>" : "") +
                (c.responsable ? "<span>· " + U.escape(c.responsable) + "</span>" : "") +
                "<span>· " + when + "</span></div></div>" +
            '<div class="tl-right">' + right +
                '<span class="tl-status ' + c.statut + '">' + st.label + "</span></div></div>";
    }

    /* ============================================================
       VUE CARTE MENTALE (radiale : racine au centre → pôles → chantiers)
       ============================================================ */
    function mmTrunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
    function mmLine(x1, y1, x2, y2, stroke, w, op) {
        return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke-width="' + w + '" style="stroke:' + stroke + ';opacity:' + op + '"/>';
    }
    views.renderMindmap = function () {
        var q = U.viewState.search;
        var poles = U.store.polesArray(U.viewState.poleSort);
        var wrap = $("mindmap");
        if (!poles.length) {
            wrap.innerHTML = '<div class="empty-state"><i class="fa-solid fa-sitemap"></i><p>Aucun pôle à afficher.</p></div>';
            return;
        }
        var data = poles.map(function (p) {
            return { p: p, chs: U.store.sortByFocus(U.store.chantiersOfPole(p.id).filter(function (c) { return matches(c, q); })) };
        });
        var nP = data.length;
        var maxCh = data.reduce(function (m, d) { return Math.max(m, d.chs.length); }, 1);
        var TAU = Math.PI * 2, sectorFrac = 0.82, minSpacing = 24;
        var R1 = 170, R2 = R1 + 130;
        var need = (maxCh * minSpacing * nP) / (TAU * sectorFrac);
        if (need > R2) R2 = need;
        var room = 235;
        var size = Math.round(2 * (R2 + room));
        var cx = size / 2, cy = size / 2;
        var links = [], poleNodes = [], chNodes = [];
        data.forEach(function (d, i) {
            var theta = -Math.PI / 2 + (i / nP) * TAU;
            var ct = Math.cos(theta), stt = Math.sin(theta);
            var px = cx + R1 * ct, py = cy + R1 * stt;
            var color = U.themeColor(d.p.theme);
            var right = ct >= -0.01;
            links.push(mmLine(cx, cy, px, py, "var(--border-2)", 1.5, 0.5));
            var n = d.chs.length;
            poleNodes.push('<g class="mm-node" data-act="open-pole" data-id="' + d.p.id + '">' +
                '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="11" style="fill:' + color + ';stroke:var(--surface);stroke-width:2"/>' +
                '<text x="' + (px + ct * 16).toFixed(1) + '" y="' + (py + stt * 16 + 4).toFixed(1) + '" text-anchor="' + (right ? "start" : "end") + '" style="fill:var(--text);font-weight:700" font-size="13">' + U.escape(mmTrunc(d.p.name, 18)) + " (" + n + ")</text></g>");
            var half = (TAU / nP) * sectorFrac / 2;
            d.chs.forEach(function (ch, j) {
                var a = (n === 1) ? theta : (theta - half + (2 * half) * (j / (n - 1)));
                var ca = Math.cos(a), sa = Math.sin(a);
                var chx = cx + R2 * ca, chy = cy + R2 * sa;
                var prio = P[ch.priorite] || P[U.DEFAULT_PRIORITY];
                links.push(mmLine(px, py, chx, chy, color, 1, 0.32));
                var rc = ca >= -0.01, deg = a * 180 / Math.PI, rot = rc ? deg : deg + 180;
                var tx = chx + ca * 8, ty = chy + sa * 8;
                var op = ch.statut === "termine" ? ";opacity:.5" : "";
                chNodes.push('<g class="mm-node" data-act="edit-chantier" data-cid="' + ch.id + '" style="cursor:pointer' + op + '">' +
                    "<title>" + U.escape(ch.nom) + "</title>" +
                    '<circle cx="' + chx.toFixed(1) + '" cy="' + chy.toFixed(1) + '" r="4" style="fill:' + prio.color + '"/>' +
                    '<text x="' + tx.toFixed(1) + '" y="' + (ty + 3.5).toFixed(1) + '" text-anchor="' + (rc ? "start" : "end") + '" transform="rotate(' + rot.toFixed(1) + " " + tx.toFixed(1) + " " + ty.toFixed(1) + ')" style="fill:var(--muted)" font-size="10.5">' + U.escape(mmTrunc(ch.nom, 22)) + "</text></g>");
            });
        });
        var svg = ['<svg class="mm-svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg">'];
        svg.push(links.join(""));
        svg.push(poleNodes.join(""));
        svg.push(chNodes.join(""));
        svg.push('<g><circle cx="' + cx + '" cy="' + cy + '" r="34" style="fill:var(--brand)"/>' +
            '<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" style="fill:#fff;font-weight:800" font-size="13">Ultra</text>' +
            '<text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" style="fill:#fff;font-weight:600;opacity:.9" font-size="11">Macro</text></g>');
        svg.push("</svg>");
        wrap.innerHTML = svg.join("");
    };

    /* ============================================================
       VUE DAILY TASKS (liste « à la Asana » : sections + tâches)
       ============================================================ */
    function matchesTask(t, q) {
        if (!q) return true;
        q = q.toLowerCase();
        var ch = t.chantier ? U.store.chantier(t.chantier) : null;
        return (t.title || "").toLowerCase().indexOf(q) !== -1
            || (t.notes || "").toLowerCase().indexOf(q) !== -1
            || (t.assignee || "").toLowerCase().indexOf(q) !== -1
            || (ch && (ch.nom || "").toLowerCase().indexOf(q) !== -1);
    }

    /* --- Comparateurs de tri (terminées toujours reléguées en bas) --- */
    function prioRank(t) { return t.priority && P[t.priority] ? P[t.priority].rank : 3; }
    function dueVal(t) { var d = U.parseDate(t.due); return d ? d.getTime() : Infinity; }
    function cmpFocus(a, b) { return prioRank(a) - prioRank(b) || dueVal(a) - dueVal(b) || String(a.createdAt).localeCompare(String(b.createdAt)); }
    function cmpDue(a, b) { return dueVal(a) - dueVal(b) || prioRank(a) - prioRank(b); }
    function cmpChrono(a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }
    function doneLast(cmp) { return function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || cmp(a, b); }; }

    function taskRow(t, draggable) {
        var prio = t.priority && P[t.priority] ? P[t.priority] : null;
        var meta = "";
        if (t.due) meta += '<span class="task-due"><i class="fa-regular fa-clock"></i> ' + U.escape(U.relativeLabel(t.due)) + "</span>";
        if (t.assignee) meta += '<span class="task-assignee" title="' + U.escape(t.assignee) + '"><span class="task-ava">' + U.escape(U.initials(t.assignee)) + "</span>" + U.escape(t.assignee) + "</span>";
        if (t.chantier) {
            var ch = U.store.chantier(t.chantier);
            if (ch) {
                var pole = U.store.pole(ch.pole);
                var color = pole ? U.themeColor(pole.theme) : "var(--faint)";
                meta += '<span class="task-chantier" style="--pole:' + color + '"><i class="fa-solid fa-diagram-project"></i> ' + U.escape(ch.nom) + "</span>";
            }
        }
        var metaHTML = meta ? '<div class="task-meta">' + meta + "</div>" : "";
        var accent = prio ? ' style="border-left-color:' + prio.color + '"' : "";
        var prioTitle = prio ? ' title="Priorité ' + prio.label + '"' : "";
        return '<div class="task-row' + (t.done ? " is-done" : "") + (prio ? " has-prio" : "") + '"' + accent + (draggable ? ' draggable="true"' : "") + ' data-tid="' + t.id + '"' + prioTitle + ">" +
            '<button class="task-check" data-act="toggle-task" data-tid="' + t.id + '" aria-label="' + (t.done ? "Rouvrir la tâche" : "Marquer terminée") + '"><i class="fa-solid fa-check"></i></button>' +
            '<div class="task-body" data-act="edit-task" data-tid="' + t.id + '">' +
                '<span class="task-title">' + U.escape(t.title) + "</span>" + metaHTML +
            "</div>" +
            '<div class="task-actions">' +
                '<button class="task-act" data-act="edit-task" data-tid="' + t.id + '" title="Modifier"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="task-act del" data-act="del-task" data-tid="' + t.id + '" title="Supprimer"><i class="fa-solid fa-trash"></i></button>' +
            "</div>" +
        "</div>";
    }

    /* --- Options réutilisables pour la saisie rapide --- */
    function priorityOptions(sel) {
        var o = '<option value="">Priorité</option>';
        U.PRIORITY_ORDER.forEach(function (k) { o += '<option value="' + k + '"' + (sel === k ? " selected" : "") + ">" + U.PRIORITIES[k].label + "</option>"; });
        return o;
    }
    function assigneeOptions(sel, placeholder) {
        var o = '<option value="">' + (placeholder || "Assigné") + "</option>";
        U.store.responsables().forEach(function (n) { o += '<option value="' + U.escape(n) + '"' + (sel === n ? " selected" : "") + ">" + U.escape(n) + "</option>"; });
        return o;
    }
    function chantierOptions(sel, placeholder) {
        var o = '<option value="">' + (placeholder || "Chantier") + "</option>";
        U.store.polesArray().forEach(function (p) {
            var list = U.store.chantiersOfPole(p.id);
            if (!list.length) return;
            o += '<optgroup label="' + U.escape(p.name) + '">';
            list.forEach(function (c) { o += '<option value="' + U.escape(c.id) + '"' + (sel === c.id ? " selected" : "") + ">" + U.escape(c.nom) + "</option>"; });
            o += "</optgroup>";
        });
        return o;
    }
    U.dailyOptions = { assignee: assigneeOptions, chantier: chantierOptions, priority: priorityOptions };

    // Ligne de saisie rapide : nom + priorité + échéance + assigné + chantier (Entrée pour créer).
    function quickAddRow(sid) {
        var key = sid || "";
        var d = U.viewState.quickAdd[key] || {};
        return '<div class="qa-row" data-sid="' + key + '">' +
            '<i class="fa-solid fa-plus qa-plus"></i>' +
            '<input class="qa-name" data-sid="' + key + '" maxlength="200" placeholder="Ajouter une tâche…" />' +
            '<select class="qa-field qa-priority" data-sid="' + key + '" title="Priorité">' + priorityOptions(d.priority) + "</select>" +
            '<input class="qa-field qa-due" type="date" data-sid="' + key + '" title="Échéance" />' +
            '<select class="qa-field qa-assignee" data-sid="' + key + '" title="Assigné">' + assigneeOptions(d.assignee) + "</select>" +
            '<select class="qa-field qa-chantier" data-sid="' + key + '" title="Chantier">' + chantierOptions(d.chantier) + "</select>" +
        "</div>";
    }

    function sectionBlock(sec, isImplicit) {
        var sid = isImplicit ? "" : sec.id;
        var q = U.viewState.search;
        var collapsed = !isImplicit && !!U.viewState.collapsedSections[sec.id];

        var all = U.store.dailyTasksOfSection(sid || null);
        var activeCount = all.filter(function (t) { return !t.done; }).length;

        var tasks = all.filter(function (t) { return matchesTask(t, q); });
        if (U.viewState.dailyHideDone) tasks = tasks.filter(function (t) { return !t.done; });
        tasks.sort(doneLast(function (a, b) { return (a.order || 0) - (b.order || 0); }));

        if (q && !tasks.length && !isImplicit) return "";

        var editing = !isImplicit && U.viewState.editingSection === sec.id;
        var nameEl = editing
            ? '<input class="ds-name-input" data-sid="' + sec.id + '" value="' + U.escape(sec.name) + '" maxlength="60" />'
            : '<h3 class="ds-name">' + U.escape(isImplicit ? "Mes tâches" : sec.name) + "</h3>";
        var collapseBtn = isImplicit
            ? '<span class="ds-collapse-spacer"></span>'
            : '<button class="ds-collapse" data-act="toggle-section" data-sid="' + sec.id + '" aria-label="Replier ou déplier"><i class="fa-solid fa-chevron-' + (collapsed ? "right" : "down") + '"></i></button>';
        var actions = isImplicit ? "" :
            '<div class="ds-actions">' +
                '<button class="ds-act" data-act="rename-section" data-sid="' + sec.id + '" title="Renommer"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="ds-act del" data-act="del-section" data-sid="' + sec.id + '" title="Supprimer la section"><i class="fa-solid fa-trash"></i></button>' +
            "</div>";
        var head = '<div class="daily-section-head">' + collapseBtn + nameEl +
            '<span class="ds-count">' + activeCount + "</span>" + actions + "</div>";

        var body = "";
        if (!collapsed) {
            var rows = tasks.map(function (t) { return taskRow(t, true); }).join("");
            body = '<div class="daily-list" data-sid="' + sid + '">' + rows + quickAddRow(sid) + "</div>";
        }
        return '<div class="daily-section' + (isImplicit ? " is-implicit" : "") + '" data-sid="' + sid + '">' + head + body + "</div>";
    }

    // Groupes calculés selon le mode d'organisation choisi.
    function visibleTasks() {
        var q = U.viewState.search;
        return U.store.dailyTasksArray().filter(function (t) {
            if (!matchesTask(t, q)) return false;
            if (U.viewState.dailyHideDone && t.done) return false;
            return true;
        });
    }
    function computeGroups(mode) {
        var tasks = visibleTasks(), groups = [];
        if (mode === "chrono") {
            groups.push({ label: null, tasks: tasks.slice().sort(doneLast(cmpChrono)) });
        } else if (mode === "focus") {
            groups.push({ label: null, tasks: tasks.slice().sort(doneLast(cmpFocus)) });
        } else if (mode === "priority") {
            U.PRIORITY_ORDER.concat([null]).forEach(function (k) {
                var g = tasks.filter(function (t) { return (t.priority && P[t.priority] ? t.priority : null) === k; });
                if (g.length) groups.push({ label: k ? P[k].label : "Sans priorité", icon: "fa-solid fa-flag", tasks: g.sort(doneLast(cmpDue)) });
            });
        } else if (mode === "due") {
            [
                { label: "En retard", t: function (n) { return n !== null && n < 0; } },
                { label: "Aujourd'hui", t: function (n) { return n === 0; } },
                { label: "Cette semaine", t: function (n) { return n >= 1 && n <= 7; } },
                { label: "Ce mois-ci", t: function (n) { return n > 7 && n <= 31; } },
                { label: "Plus tard", t: function (n) { return n > 31; } },
                { label: "Sans échéance", t: function (n) { return n === null; } }
            ].forEach(function (b) {
                var g = tasks.filter(function (t) { return b.t(U.daysUntil(t.due)); });
                if (g.length) groups.push({ label: b.label, icon: "fa-regular fa-calendar", tasks: g.sort(doneLast(cmpDue)) });
            });
        } else if (mode === "assignee") {
            var names = {};
            tasks.forEach(function (t) { if (t.assignee) names[t.assignee] = true; });
            Object.keys(names).sort(function (a, b) { return a.localeCompare(b, "fr"); }).forEach(function (a) {
                groups.push({ label: a, icon: "fa-regular fa-user", tasks: tasks.filter(function (t) { return t.assignee === a; }).sort(doneLast(cmpFocus)) });
            });
            var none = tasks.filter(function (t) { return !t.assignee; });
            if (none.length) groups.push({ label: "Non assigné", icon: "fa-regular fa-user", tasks: none.sort(doneLast(cmpFocus)) });
        } else if (mode === "chantier") {
            U.store.polesArray().forEach(function (p) {
                U.store.chantiersOfPole(p.id).forEach(function (c) {
                    var g = tasks.filter(function (t) { return t.chantier === c.id; });
                    if (g.length) groups.push({ label: c.nom, sub: p.name, icon: "fa-solid fa-diagram-project", color: U.themeColor(p.theme), tasks: g.sort(doneLast(cmpFocus)) });
                });
            });
            var noCh = tasks.filter(function (t) { return !t.chantier || !U.store.chantier(t.chantier); });
            if (noCh.length) groups.push({ label: "Sans chantier", icon: "fa-solid fa-diagram-project", tasks: noCh.sort(doneLast(cmpFocus)) });
        }
        return groups;
    }
    function groupBlock(g) {
        var rows = g.tasks.map(function (t) { return taskRow(t, false); }).join("");
        var head = "";
        if (g.label !== null) {
            var activeCount = g.tasks.filter(function (t) { return !t.done; }).length;
            var icon = g.icon ? '<i class="' + g.icon + '"' + (g.color ? ' style="color:' + g.color + '"' : "") + "></i> " : "";
            var sub = g.sub ? '<span class="dg-sub">' + U.escape(g.sub) + "</span>" : "";
            head = '<div class="daily-section-head dg-head">' + icon + '<h3 class="ds-name">' + U.escape(g.label) + "</h3>" + sub +
                '<span class="ds-count">' + activeCount + "</span></div>";
        }
        return '<div class="daily-section' + (g.label === null ? " is-flat" : "") + '">' + head + '<div class="daily-list">' + rows + "</div></div>";
    }

    views.renderDaily = function () {
        var board = $("dailyBoard");
        if (!board) return;
        var mode = U.viewState.dailyGroup || "manual";
        var addSecBtn = $("dailyAddSection"); if (addSecBtn) addSecBtn.hidden = (mode !== "manual");

        var html = "";
        if (mode === "manual") {
            var sections = U.store.dailySectionsArray();
            var showImplicit = (sections.length === 0) || U.store.hasOrphanTasks();
            if (showImplicit) html += sectionBlock({ id: "", name: "Mes tâches" }, true);
            sections.forEach(function (s) { html += sectionBlock(s, false); });
            if (!html) html = '<div class="empty-state"><i class="fa-regular fa-square-check"></i><p>Aucune tâche ne correspond.</p></div>';
        } else {
            html += '<div class="daily-section is-flat qa-standalone">' + quickAddRow("") + "</div>";
            var groups = computeGroups(mode);
            if (!groups.length) html += '<div class="empty-state"><i class="fa-regular fa-square-check"></i><p>Aucune tâche ne correspond.</p></div>';
            groups.forEach(function (g) { html += groupBlock(g); });
        }
        board.innerHTML = html;

        // Rester dans le champ de saisie rapide après création (flux « taper, Entrée, continuer »).
        if (U.viewState._focusAddSid !== undefined) {
            var fs = U.viewState._focusAddSid; U.viewState._focusAddSid = undefined;
            var ai = board.querySelector('.qa-name[data-sid="' + (fs || "") + '"]');
            if (ai) ai.focus();
        }
        if (U.viewState.editingSection) {
            var ei = board.querySelector('.ds-name-input[data-sid="' + U.viewState.editingSection + '"]');
            if (ei && document.activeElement !== ei) { ei.focus(); ei.select(); }
        }
    };

    // Crée une tâche à partir d'une ligne de saisie rapide (Entrée depuis n'importe quel champ).
    function createFromQuickRow(row) {
        var title = row.querySelector(".qa-name").value.trim();
        if (!title) { row.querySelector(".qa-name").focus(); return; }
        var key = row.dataset.sid || "";
        var prio = row.querySelector(".qa-priority").value || null;
        var assignee = row.querySelector(".qa-assignee").value || null;
        var chantier = row.querySelector(".qa-chantier").value || null;
        U.viewState.quickAdd[key] = { priority: prio, assignee: assignee, chantier: chantier }; // champs « collants »
        U.viewState._focusAddSid = key;
        U.store.saveDailyTask({
            title: title, section: (row.dataset.sid || null),
            priority: prio, due: row.querySelector(".qa-due").value || null,
            assignee: assignee, chantier: chantier
        });
    }

    // Validation / annulation du renommage d'une section (Entrée, Échap ou perte de focus).
    function commitSectionRename(input, cancel) {
        if (U.viewState.editingSection == null) return; // déjà traité
        var sid = input.dataset.sid;
        U.viewState.editingSection = null;
        if (!cancel) {
            var name = input.value.trim();
            var sec = U.store.dailySection(sid);
            if (sec && name && name !== sec.name) { U.store.saveDailySection({ id: sid, name: name }); return; }
        }
        views.renderDaily();
    }

    /* ============================================================
       VUE BOÎTE DE RÉCEPTION (messages WhatsApp interprétés par l'IA)
       ============================================================ */
    var INTENT_LABELS = { update_chantier: "Mise à jour", new_task: "Tâche", note: "Note", new_chantier: "Nouveau chantier", unknown: "À trier" };

    function canAutoApply(m) {
        var ai = m.ai || {};
        if (ai.intent === "new_task") return true;
        if ((ai.intent === "update_chantier" || ai.intent === "note") && ai.chantierId && U.store.chantier(ai.chantierId)) return true;
        return false;
    }
    function inboxProposedText(m) {
        var ai = m.ai || {}, p = ai.proposed || {};
        var ch = ai.chantierId ? U.store.chantier(ai.chantierId) : null;
        var bits = [];
        if (ai.intent === "update_chantier") {
            bits.push(ch ? "Chantier « " + U.escape(ch.nom) + " »" : "Chantier (non identifié)");
            if (p.statut && S[p.statut]) bits.push("statut → " + S[p.statut].label);
            if (p.progression != null) bits.push("avancement → " + U.escape(String(p.progression)) + "%");
            if (p.deadline) bits.push("échéance → " + U.escape(U.formatShort(p.deadline)));
            if (p.priority && P[p.priority]) bits.push("priorité → " + P[p.priority].label);
        } else if (ai.intent === "new_task") {
            bits.push("Nouvelle tâche : « " + U.escape(p.taskTitle || p.title || m.rawText || "") + " »");
            if (ch) bits.push("chantier · " + U.escape(ch.nom));
            if (p.deadline || p.due) bits.push("échéance → " + U.escape(U.formatShort(p.deadline || p.due)));
        } else if (ai.intent === "note") {
            bits.push(ch ? "Note sur « " + U.escape(ch.nom) + " »" : "Note (chantier non identifié)");
        } else if (ai.intent === "new_chantier") {
            bits.push("Nouveau chantier proposé — à compléter manuellement");
        } else {
            bits.push("Intention non reconnue — à traiter manuellement");
        }
        return bits.join(" · ");
    }
    function inboxCard(m) {
        var ai = m.ai || {};
        var status = m.status || "pending";
        var conf = (typeof ai.confidence === "number") ? Math.round(ai.confidence * 100) + "%" : "";
        var when = m.receivedAt ? U.formatShort(String(m.receivedAt).slice(0, 10)) : "";
        var actions;
        if (status === "pending") {
            actions = (canAutoApply(m) ? '<button class="btn btn-primary btn-sm" data-act="apply-inbox" data-mid="' + m.id + '"><i class="fa-solid fa-check"></i> Appliquer</button>' : "") +
                '<button class="btn btn-ghost btn-sm" data-act="modify-inbox" data-mid="' + m.id + '"><i class="fa-solid fa-pen"></i> Modifier</button>' +
                '<button class="btn btn-ghost btn-sm" data-act="reject-inbox" data-mid="' + m.id + '"><i class="fa-solid fa-xmark"></i> Rejeter</button>';
        } else {
            actions = '<span class="inbox-status-tag">' + (status === "applied" ? "Appliqué" : "Rejeté") + "</span>" +
                '<button class="task-act del" data-act="delete-inbox" data-mid="' + m.id + '" title="Supprimer"><i class="fa-solid fa-trash"></i></button>';
        }
        return '<div class="inbox-card status-' + status + '" data-mid="' + m.id + '">' +
            '<div class="inbox-head">' +
                '<span class="inbox-from"><i class="fa-brands fa-whatsapp"></i> ' + U.escape(U.store.inboxSenderName(m)) + "</span>" +
                '<span class="inbox-intent">' + (INTENT_LABELS[ai.intent] || INTENT_LABELS.unknown) + "</span>" +
                (conf ? '<span class="inbox-conf" title="Confiance de l\'IA">' + conf + "</span>" : "") +
                '<span class="inbox-time">' + U.escape(when) + "</span>" +
            "</div>" +
            '<div class="inbox-raw">' + U.escape(m.rawText || "") + "</div>" +
            '<div class="inbox-proposed"><i class="fa-solid fa-wand-magic-sparkles"></i> ' + inboxProposedText(m) + "</div>" +
            '<div class="inbox-actions">' + actions + "</div>" +
        "</div>";
    }
    views.renderInbox = function () {
        var board = $("inboxBoard"); if (!board) return;
        var filter = U.viewState.inboxFilter || "pending";
        var q = (U.viewState.search || "").toLowerCase();
        var list = U.store.inboxArray().filter(function (m) {
            if (filter === "pending" && (m.status || "pending") !== "pending") return false;
            if (q && (m.rawText || "").toLowerCase().indexOf(q) === -1 && U.store.inboxSenderName(m).toLowerCase().indexOf(q) === -1) return false;
            return true;
        });
        board.innerHTML = list.length ? list.map(inboxCard).join("")
            : '<div class="empty-state"><i class="fa-regular fa-envelope-open"></i><p>' + (filter === "pending" ? "Aucun message à valider." : "Boîte de réception vide.") + "</p></div>";
    };

    /* ============================================================
       VUE COMPTES RENDUS
       ============================================================ */
    function reportCard(r) {
        var periodLabel = r.period === "week" ? "Hebdomadaire" : "Journalier";
        var d = r.date ? U.formatShort(r.date) : "";
        return '<div class="report-card" data-rid="' + r.id + '">' +
            '<div class="report-head"><span class="report-period">' + periodLabel + "</span>" +
                '<span class="report-date">' + U.escape(d) + "</span>" +
                '<button class="task-act del" data-act="delete-report" data-rid="' + r.id + '" title="Supprimer"><i class="fa-solid fa-trash"></i></button></div>' +
            '<h3 class="report-title">' + U.escape(r.title || "") + "</h3>" +
            '<div class="report-body">' + U.escape(r.body || "").replace(/\n/g, "<br>") + "</div>" +
        "</div>";
    }
    views.renderReports = function () {
        var board = $("reportsBoard"); if (!board) return;
        var q = (U.viewState.search || "").toLowerCase();
        var list = U.store.reportsArray().filter(function (r) {
            return !q || (r.title || "").toLowerCase().indexOf(q) !== -1 || (r.body || "").toLowerCase().indexOf(q) !== -1;
        });
        board.innerHTML = list.length ? list.map(reportCard).join("")
            : '<div class="empty-state"><i class="fa-regular fa-file"></i><p>Aucun compte rendu pour le moment.</p></div>';
    };

    // Pastille de messages en attente (bouton « Autres » + entrée de menu).
    views.updateBadges = function () {
        var n = U.store.inboxPendingCount();
        ["inboxBadgeMore", "inboxBadgeItem"].forEach(function (id) {
            var el = $(id); if (!el) return;
            el.textContent = n; el.hidden = !n;
        });
    };

    /* ============================================================
       Rendu global (appelé sur chaque changement du store)
       ============================================================ */
    views.render = function () {
        var v = U.viewState.current;
        if (v === "dashboard") views.renderDashboard();
        else if (v === "pole") views.renderKanban();
        else if (v === "kanban") views.renderKanbanGlobal();
        else if (v === "mindmap") views.renderMindmap();
        else if (v === "calendar") views.renderTimeline();
        else if (v === "daily") views.renderDaily();
        else if (v === "inbox") views.renderInbox();
        else if (v === "reports") views.renderReports();
        views.updateBadges();
    };

    /* --------- Délégation d'événements --------- */
    function actionFromEvent(e) {
        var el = e.target.closest("[data-act]");
        return el ? { act: el.dataset.act, id: el.dataset.id, cid: el.dataset.cid, oid: el.dataset.oid, tid: el.dataset.tid, sid: el.dataset.sid, mid: el.dataset.mid, rid: el.dataset.rid } : null;
    }
    function handleAction(e) {
        var a = actionFromEvent(e); if (!a) return;
        if (a.act === "open-pole") U.nav("pole", a.id);
        else if (a.act === "edit-pole") U.ui.openPole(a.id);
        else if (a.act === "edit-chantier") U.ui.openChantier(a.cid);
        else if (a.act === "delete-chantier") { e.stopPropagation(); U.ui.deleteChantierFlow(a.cid); }
        else if (a.act === "edit-objective") U.ui.openObjective(a.oid);
        else if (a.act === "new-objective") U.ui.openObjective();
        // --- Daily tasks ---
        else if (a.act === "toggle-task") { var t = U.store.dailyTask(a.tid); if (t) U.store.setDailyTaskDone(a.tid, !t.done); }
        else if (a.act === "edit-task") U.ui.openDailyTask(a.tid);
        else if (a.act === "del-task") { e.stopPropagation(); U.ui.deleteDailyTaskFlow(a.tid); }
        else if (a.act === "toggle-section") { var sid = a.sid; U.viewState.collapsedSections[sid] = !U.viewState.collapsedSections[sid]; views.renderDaily(); }
        else if (a.act === "rename-section") { U.viewState.editingSection = a.sid; views.renderDaily(); }
        else if (a.act === "del-section") U.ui.deleteDailySectionFlow(a.sid);
        // --- Boîte de réception / comptes rendus ---
        else if (a.act === "apply-inbox") { var res = U.store.applyInboxItem(a.mid); U.ui.toast(res ? "Message appliqué" : "Impossible d'appliquer — utilisez « Modifier »", res ? "success" : "error"); }
        else if (a.act === "modify-inbox") U.ui.reviewInboxModify(a.mid);
        else if (a.act === "reject-inbox") { U.store.setInboxStatus(a.mid, "rejected"); U.ui.toast("Message rejeté", "info"); }
        else if (a.act === "delete-inbox") U.store.deleteInboxItem(a.mid);
        else if (a.act === "delete-report") U.ui.deleteReportFlow(a.rid);
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

    /* --------- Réordonnancement des pôles (glisser-déposer) --------- */
    var dragPole = null;
    function bindPoleReorder(grid) {
        grid.addEventListener("dragstart", function (e) {
            var card = e.target.closest(".pole-card.pole-drag"); if (!card) return;
            dragPole = card.dataset.pole; card.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", dragPole); } catch (err) {}
        });
        grid.addEventListener("dragend", function () {
            grid.querySelectorAll(".dragging, .drop-target").forEach(function (c) { c.classList.remove("dragging", "drop-target"); });
            dragPole = null;
        });
        grid.addEventListener("dragover", function (e) {
            if (!dragPole) return;
            var card = e.target.closest(".pole-card"); if (!card) return;
            e.preventDefault(); e.dataTransfer.dropEffect = "move";
            grid.querySelectorAll(".drop-target").forEach(function (c) { if (c !== card) c.classList.remove("drop-target"); });
            if (card.dataset.pole !== dragPole) card.classList.add("drop-target");
        });
        grid.addEventListener("drop", function (e) {
            var card = e.target.closest(".pole-card"); if (!card || !dragPole) return;
            e.preventDefault();
            var target = card.dataset.pole;
            if (target && target !== dragPole) U.store.movePole(dragPole, target);
            dragPole = null;
        });
    }

    /* --------- Glisser-déposer Daily tasks (réordonner + changer de section) --------- */
    var dragTask = null;
    function clearDailyHints(board) {
        board.querySelectorAll(".drop-before, .drop-into").forEach(function (c) { c.classList.remove("drop-before", "drop-into"); });
    }
    function bindDailyDnD(board) {
        board.addEventListener("dragstart", function (e) {
            var row = e.target.closest(".task-row"); if (!row) return;
            dragTask = row.dataset.tid; row.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", dragTask); } catch (err) {}
        });
        board.addEventListener("dragend", function () {
            board.querySelectorAll(".dragging").forEach(function (c) { c.classList.remove("dragging"); });
            clearDailyHints(board);
            dragTask = null;
        });
        board.addEventListener("dragover", function (e) {
            if (!dragTask) return;
            var list = e.target.closest(".daily-list"); if (!list) return;
            e.preventDefault(); e.dataTransfer.dropEffect = "move";
            clearDailyHints(board);
            var row = e.target.closest(".task-row");
            if (row && row.dataset.tid !== dragTask) row.classList.add("drop-before");
            else if (!row) list.classList.add("drop-into");
        });
        board.addEventListener("drop", function (e) {
            if (!dragTask) return;
            var list = e.target.closest(".daily-list"); if (!list) { dragTask = null; return; }
            e.preventDefault();
            var row = e.target.closest(".task-row");
            var targetId = (row && row.dataset.tid !== dragTask) ? row.dataset.tid : null;
            U.store.moveDailyTask(dragTask, targetId, list.dataset.sid || null);
            clearDailyHints(board);
            dragTask = null;
        });
    }

    views.init = function () {
        ["polesGrid", "kanban", "kanbanGlobal", "timeline", "mindmap", "objectivesRow", "dailyBoard", "inboxBoard", "reportsBoard"].forEach(function (id) {
            $(id).addEventListener("click", handleAction);
        });
        bindDnD($("kanban"));
        bindDnD($("kanbanGlobal"));
        bindPoleReorder($("polesGrid"));

        // Daily tasks : saisie rapide (Entrée), renommage de section (Entrée / Échap / blur), glisser-déposer.
        var board = $("dailyBoard");
        bindDailyDnD(board);
        board.addEventListener("keydown", function (e) {
            var el = e.target;
            var qaRow = el.closest ? el.closest(".qa-row") : null;
            if (qaRow) {
                // Entrée valide la tâche depuis N'IMPORTE quel champ de la ligne (pas seulement le titre).
                if (e.key === "Enter") { e.preventDefault(); createFromQuickRow(qaRow); }
            } else if (el.classList.contains("ds-name-input")) {
                if (e.key === "Enter") { e.preventDefault(); el.blur(); }
                else if (e.key === "Escape") { e.preventDefault(); commitSectionRename(el, true); }
            }
        });
        // Champs « collants » de la saisie rapide (priorité / assigné / chantier) conservés entre les créations.
        board.addEventListener("change", function (e) {
            var el = e.target;
            if (el.classList.contains("qa-priority") || el.classList.contains("qa-assignee") || el.classList.contains("qa-chantier")) {
                var row = el.closest(".qa-row"); if (!row) return;
                U.viewState.quickAdd[row.dataset.sid || ""] = {
                    priority: row.querySelector(".qa-priority").value || null,
                    assignee: row.querySelector(".qa-assignee").value || null,
                    chantier: row.querySelector(".qa-chantier").value || null
                };
            }
        });
        board.addEventListener("focusout", function (e) {
            if (e.target.classList.contains("ds-name-input")) commitSectionRename(e.target, false);
        });
    };

    U.views = views;

})(window.Ultra);
