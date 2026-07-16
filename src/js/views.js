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
       Rendu global (appelé sur chaque changement du store)
       ============================================================ */
    views.render = function () {
        var v = U.viewState.current;
        if (v === "dashboard") views.renderDashboard();
        else if (v === "pole") views.renderKanban();
        else if (v === "kanban") views.renderKanbanGlobal();
        else if (v === "mindmap") views.renderMindmap();
        else if (v === "calendar") views.renderTimeline();
    };

    /* --------- Délégation d'événements --------- */
    function actionFromEvent(e) {
        var el = e.target.closest("[data-act]");
        return el ? { act: el.dataset.act, id: el.dataset.id, cid: el.dataset.cid, oid: el.dataset.oid } : null;
    }
    function handleAction(e) {
        var a = actionFromEvent(e); if (!a) return;
        if (a.act === "open-pole") U.nav("pole", a.id);
        else if (a.act === "edit-pole") U.ui.openPole(a.id);
        else if (a.act === "edit-chantier") U.ui.openChantier(a.cid);
        else if (a.act === "delete-chantier") { e.stopPropagation(); U.ui.deleteChantierFlow(a.cid); }
        else if (a.act === "edit-objective") U.ui.openObjective(a.oid);
        else if (a.act === "new-objective") U.ui.openObjective();
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

    views.init = function () {
        ["polesGrid", "kanban", "kanbanGlobal", "timeline", "mindmap", "objectivesRow"].forEach(function (id) {
            $(id).addEventListener("click", handleAction);
        });
        bindDnD($("kanban"));
        bindDnD($("kanbanGlobal"));
        bindPoleReorder($("polesGrid"));
    };

    U.views = views;

})(window.Ultra);
