/*
 * Distributori – logica pura (nessun accesso a DOM o rete).
 * Funziona sia nel browser (window.DL) sia in Node (module.exports) per i test.
 */
(function (root) {
  "use strict";

  const R_TERRA = 6371000;

  function distanza(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R_TERRA * Math.asin(Math.sqrt(a));
  }

  function formattaDistanza(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + " m";
    return (m / 1000).toFixed(1).replace(".", ",") + " km";
  }

  // Minuti in auto, stima prudente in città (circa 30 km/h)
  function minutiInAuto(m) {
    return Math.max(1, Math.round(m / 500));
  }

  // ---------- Carburanti ----------
  // Codici usati nei file del sito: B benzina, G gasolio, L GPL, M metano, X altri (con il nome)
  const CARBURANTI = {
    B: { nome: "Benzina", unita: "l" },
    G: { nome: "Gasolio", unita: "l" },
    L: { nome: "GPL", unita: "l" },
    M: { nome: "Metano", unita: "kg" }
  };

  function formattaPrezzo(p) {
    return p == null ? "–" : p.toFixed(3).replace(".", ",");
  }

  // Prezzo di un distributore per il carburante e la modalità scelti (self o servito)
  // Ogni voce in d.f: [categoria, nome, prezzo, self 1/0, data ISO]
  function prezzoDi(d, cat, modo) {
    const vuoleSelf = modo !== "servito" ? 1 : 0;
    const f = d.f || [];
    let v = f.find((x) => x[0] === cat && x[3] === vuoleSelf);
    // GPL e metano si fanno quasi sempre al servito: se manca il prezzo nel modo scelto, usa l'altro
    if (!v && (cat === "L" || cat === "M")) v = f.find((x) => x[0] === cat);
    return v ? { prezzo: v[2], self: !!v[3], data: v[4] || null } : null;
  }

  // true se il distributore ha almeno un prezzo per quel carburante (self o servito)
  function vende(d, cat) {
    return (d.f || []).some((x) => x[0] === cat);
  }

  // Tabella dei prezzi per il riquadro: una riga per carburante con self e servito
  function tabellaPrezzi(d) {
    const righe = new Map();
    const ordine = ["B", "G", "L", "M", "X"];
    for (const [cat, nome, prezzo, self, data] of d.f || []) {
      const chiave = cat === "X" ? "X:" + nome : cat;
      if (!righe.has(chiave)) {
        righe.set(chiave, { cat, nome: cat === "X" ? nome : CARBURANTI[cat].nome, self: null, servito: null, data: null });
      }
      const r = righe.get(chiave);
      r[self ? "self" : "servito"] = prezzo;
      if (data && (!r.data || data > r.data)) r.data = data;
    }
    return [...righe.values()].sort((a, b) => ordine.indexOf(a.cat) - ordine.indexOf(b.cat) || a.nome.localeCompare(b.nome));
  }

  // Giorni trascorsi dalla data ISO "YYYY-MM-DDTHH:MM" (ora locale) a "oggi"
  function giorniDa(dataIso, oggi) {
    if (!dataIso) return null;
    const d = new Date(dataIso);
    if (isNaN(d)) return null;
    const o = oggi ? new Date(oggi) : new Date();
    const g0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const g1 = new Date(o.getFullYear(), o.getMonth(), o.getDate());
    return Math.round((g1 - g0) / 86400000);
  }

  function quando(dataIso, oggi) {
    const g = giorniDa(dataIso, oggi);
    if (g == null) return "data non indicata";
    const d = new Date(dataIso);
    const ora = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
    if (g <= 0) return "oggi alle " + ora;
    if (g === 1) return "ieri alle " + ora;
    return g + " giorni fa (" + d.toLocaleDateString("it-IT", { day: "numeric", month: "numeric" }) + ")";
  }

  /**
   * Distributori entro il raggio, con distanza e prezzo per il carburante scelto.
   * Fascia di prezzo rispetto agli altri distributori in zona:
   *   "economico" il terzo più basso, "caro" il terzo più alto, "medio" il resto, "nd" senza prezzo.
   */
  function preparaDistributori(lista, lat, lon, raggio, cat, modo) {
    const out = [];
    for (const d of lista || []) {
      const dist = distanza(lat, lon, d.la, d.lo);
      if (dist > raggio) continue;
      // Chi non comunica prezzi di GPL o metano non li vende: non lo mostriamo
      if ((cat === "L" || cat === "M") && !vende(d, cat)) continue;
      const p = prezzoDi(d, cat, modo);
      out.push({ ...d, id: "d/" + d.i, distanza: dist, prezzo: p ? p.prezzo : null, prezzoSelf: p ? p.self : null, dataPrezzo: p ? p.data : null, fascia: "nd" });
    }
    classifica(out);
    return out;
  }

  function classifica(lista) {
    const con = lista.filter((d) => d.prezzo != null).sort((a, b) => a.prezzo - b.prezzo);
    const n = con.length;
    if (!n) return lista;
    const min = con[0].prezzo, max = con[n - 1].prezzo;
    // Soglie a un terzo e due terzi della classifica; a parità di prezzo stessa fascia
    const soglia1 = con[Math.floor((n - 1) / 3)].prezzo;
    const soglia2 = con[Math.ceil(2 * (n - 1) / 3)].prezzo;
    for (const d of con) {
      if (max - min < 0.0005) d.fascia = "economico";        // tutti uguali
      else if (d.prezzo <= soglia1) d.fascia = "economico";
      else if (d.prezzo >= soglia2 && d.prezzo > soglia1) d.fascia = "caro";
      else d.fascia = "medio";
    }
    return lista;
  }

  function statistiche(lista) {
    const prezzi = lista.filter((d) => d.prezzo != null).map((d) => d.prezzo);
    if (!prezzi.length) return { min: null, media: null, n: 0 };
    return {
      min: Math.min(...prezzi),
      media: prezzi.reduce((s, p) => s + p, 0) / prezzi.length,
      n: prezzi.length
    };
  }

  // Tessere (file del sito) che coprono il cerchio di ricerca
  function tessereNelRaggio(lat, lon, raggio, passo) {
    const dLat = raggio / 111320, dLon = raggio / (111320 * Math.cos(lat * Math.PI / 180));
    const nomi = [];
    for (let i = Math.floor((lat - dLat) / passo); i <= Math.floor((lat + dLat) / passo); i++) {
      for (let j = Math.floor((lon - dLon) / passo); j <= Math.floor((lon + dLon) / passo); j++) {
        nomi.push(`t_${i}_${j}.json`);
      }
    }
    return nomi;
  }

  // Nome da mostrare: il marchio, oppure il nome dell'impianto per le "pompe bianche"
  function titolo(d) {
    const b = (d.b || "").trim();
    if (!b || /pompe bianche/i.test(b)) return capitalizza(d.n || "Distributore");
    return b;
  }
  function capitalizza(s) {
    s = String(s || "").trim();
    if (s && s === s.toUpperCase()) {
      const minuscole = /^(di|de|del|dei|degli|della|delle|dello|da|dal|dalla|al|alla|e|ed|in|sul|sulla|per)$/;
      return s.toLowerCase().replace(/(^|[\s'’.\-/(])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase())
        .replace(/(\s)([A-ZÀ-Ù][a-zà-ù]*)(?=\s)/g, (m, sp, w) => minuscole.test(w.toLowerCase()) ? sp + w.toLowerCase() : m);
    }
    return s;
  }
  function indirizzo(d) {
    const via = capitalizza(d.a || "");
    const comune = capitalizza(d.c || "");
    return [via, comune + (d.p ? " (" + d.p + ")" : "")].filter((x) => x.trim()).join(", ");
  }

  // ---------- Percorso ----------
  // Il percorso è una linea di punti [lat, lon]. Per trovare in fretta i distributori vicini alla strada
  // ogni tratto viene messo in una griglia di celle da 0,02 gradi (circa 2 km).
  const CELLA = 0.02;
  function indicizzaPercorso(punti) {
    const cum = [0];
    for (let i = 1; i < punti.length; i++) {
      cum.push(cum[i - 1] + distanza(punti[i - 1][0], punti[i - 1][1], punti[i][0], punti[i][1]));
    }
    const griglia = new Map();
    for (let i = 0; i < punti.length - 1; i++) {
      const [a0, b0] = punti[i], [a1, b1] = punti[i + 1];
      for (let r = Math.floor(Math.min(a0, a1) / CELLA); r <= Math.floor(Math.max(a0, a1) / CELLA); r++) {
        for (let c = Math.floor(Math.min(b0, b1) / CELLA); c <= Math.floor(Math.max(b0, b1) / CELLA); c++) {
          const k = r + "_" + c;
          if (!griglia.has(k)) griglia.set(k, []);
          griglia.get(k).push(i);
        }
      }
    }
    return { punti, cum, griglia, lunghezza: cum[cum.length - 1] || 0 };
  }

  // Distanza del punto dalla strada e a che punto del percorso si trova (metri dalla partenza).
  // null se è più lontano di "max" metri.
  function vicinoAlPercorso(perc, lat, lon, max) {
    const kLat = 111320, kLon = 111320 * Math.cos(lat * Math.PI / 180);
    const dLat = max / kLat, dLon = max / kLon;
    const visti = new Set();
    let best = null;
    for (let r = Math.floor((lat - dLat) / CELLA); r <= Math.floor((lat + dLat) / CELLA); r++) {
      for (let c = Math.floor((lon - dLon) / CELLA); c <= Math.floor((lon + dLon) / CELLA); c++) {
        for (const i of perc.griglia.get(r + "_" + c) || []) {
          if (visti.has(i)) continue;
          visti.add(i);
          const [a0, b0] = perc.punti[i], [a1, b1] = perc.punti[i + 1];
          // coordinate piane in metri attorno al distributore
          const x0 = (b0 - lon) * kLon, y0 = (a0 - lat) * kLat;
          const x1 = (b1 - lon) * kLon, y1 = (a1 - lat) * kLat;
          const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
          let t = l2 ? -(x0 * dx + y0 * dy) / l2 : 0;
          t = Math.max(0, Math.min(1, t));
          const d = Math.hypot(x0 + t * dx, y0 + t * dy);
          if (d <= max && (!best || d < best.dist)) {
            best = { dist: d, lungo: perc.cum[i] + t * (perc.cum[i + 1] - perc.cum[i]) };
          }
        }
      }
    }
    return best;
  }

  // Tessere del sito che coprono la striscia larga "fascia" metri attorno al percorso
  function tesserePercorso(punti, fascia, passo) {
    // Un controllo ogni ~1 km lungo la strada, allargato di 1 km: copre anche lo spazio tra due controlli
    const nomi = new Set();
    const aggiungi = (lat, lon) => tessereNelRaggio(lat, lon, fascia + 1000, passo).forEach((t) => nomi.add(t));
    if (punti.length) aggiungi(punti[0][0], punti[0][1]);
    let resto = 0;   // metri fatti dall'ultimo controllo
    for (let i = 1; i < punti.length; i++) {
      const [a0, b0] = punti[i - 1], [a1, b1] = punti[i];
      const l = distanza(a0, b0, a1, b1);
      let s = 1000 - resto;
      while (s <= l) {
        const t = s / l;
        aggiungi(a0 + t * (a1 - a0), b0 + t * (b1 - b0));
        s += 1000;
      }
      resto = l - (s - 1000);
    }
    if (punti.length > 1) aggiungi(punti[punti.length - 1][0], punti[punti.length - 1][1]);
    return [...nomi];
  }

  // Distributori entro "fascia" metri dalla strada. "distanza" = quanto sono lontani dalla strada,
  // "km" = a che chilometro del percorso si trovano.
  function preparaPercorso(lista, perc, fascia, cat, modo) {
    const out = [];
    const visti = new Set();
    for (const d of lista || []) {
      if (visti.has(d.i)) continue;
      const v = vicinoAlPercorso(perc, d.la, d.lo, fascia);
      if (!v) continue;
      if ((cat === "L" || cat === "M") && !vende(d, cat)) continue;
      visti.add(d.i);
      const p = prezzoDi(d, cat, modo);
      out.push({ ...d, id: "d/" + d.i, distanza: v.dist, km: v.lungo / 1000, prezzo: p ? p.prezzo : null, prezzoSelf: p ? p.self : null, dataPrezzo: p ? p.data : null, fascia: "nd" });
    }
    classifica(out);
    return out;
  }

  function formattaDurata(sec) {
    const min = Math.max(1, Math.round(sec / 60));
    if (min < 60) return min + " min";
    const h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }

  const API = {
    distanza, formattaDistanza, minutiInAuto, CARBURANTI, formattaPrezzo, prezzoDi, vende, tabellaPrezzi,
    giorniDa, quando, preparaDistributori, classifica, statistiche, tessereNelRaggio, titolo, capitalizza, indirizzo,
    indicizzaPercorso, vicinoAlPercorso, tesserePercorso, preparaPercorso, formattaDurata
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.DL = API;
})(typeof window !== "undefined" ? window : globalThis);
