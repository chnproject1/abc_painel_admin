/**
 * Confere o portal US contra os dados de scripts/seed-us-teste.js.
 *
 *   node scripts/verificar-us-teste.js
 *
 * Repete as mesmas cláusulas `where` das rotas em app/api/us/* e compara com os
 * valores esperados. Só lê o banco, nunca escreve.
 *
 * Todas as contagens são restritas aos IDs `cs_test_`, para o script continuar
 * válido depois que pedidos reais começarem a entrar na tabela.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Restringe tudo aos pedidos de teste
const SO_TESTE = { id: { startsWith: "cs_test_" } };
const w = (extra = {}) => ({ ...SO_TESTE, ...extra });

let ok = 0;
let falhou = 0;

function checar(rotulo, obtido, esperado) {
  const passou = obtido === esperado;
  if (passou) ok++; else falhou++;
  const marca = passou ? "  ok  " : " FALHA";
  console.log(`${marca} ${rotulo.padEnd(46)} obtido=${String(obtido).padEnd(7)} esperado=${esperado}`);
}

(async () => {
  const url = process.env.DATABASE_URL || "";
  console.log(`Banco: ${url.replace(/^.*@/, "").replace(/\/.*$/, "")}`);

  const totalTabela = await prisma.pedidoUs.count();
  const totalTeste  = await prisma.pedidoUs.count({ where: SO_TESTE });
  console.log(`Tabela PedidoUs: ${totalTabela} registros — ${totalTeste} de teste, ${totalTabela - totalTeste} reais\n`);

  /* ── 1. /api/us/stats ── */
  console.log("── /api/us/stats ──");
  checar("total",              await prisma.pedidoUs.count({ where: w() }), 14);
  checar("pagos",              await prisma.pedidoUs.count({ where: w({ status: "pago" }) }), 13);
  checar("up1 pagos",          await prisma.pedidoUs.count({ where: w({ up1_status: "pago" }) }), 4);
  checar("up2 pagos",          await prisma.pedidoUs.count({ where: w({ up2_status: "pago" }) }), 5);
  checar("ds pagos",           await prisma.pedidoUs.count({ where: w({ ds_status: "pago" }) }), 2);
  checar("pendentes_envio",    await prisma.pedidoUs.count({ where: w({ status: "pago", entrega_email: false }) }), 2);
  checar("erro_geracao",       await prisma.pedidoUs.count({ where: w({ status: "pago", gerou_musica: false, entrega_email: false }) }), 1);
  checar("pendentes_envio_up", await prisma.pedidoUs.count({ where: w({ up2_status: "pago", up_entrega_email: false }) }), 2);
  checar("erro_geracao_up",    await prisma.pedidoUs.count({ where: w({ up2_status: "pago", up_gerou_musica: false, up_entrega_email: false }) }), 1);

  const ag = await prisma.pedidoUs.aggregate({
    where: SO_TESTE,
    _sum: { valor: true, up1_valor: true, up2_valor: true, ds_valor: true },
  });
  const num = (v) => Number(v ?? 0);
  // Preços US: basic $14, silver $19, up1 $12, up2 $9, ds $12
  checar("receita inicial", num(ag._sum.valor), 207);      // 8*14 + 5*19
  checar("receita up1",     num(ag._sum.up1_valor), 48);   // 4 x 12
  checar("receita up2",     num(ag._sum.up2_valor), 45);   // 5 x 9
  checar("receita ds",      num(ag._sum.ds_valor), 24);    // 2 x 12
  checar("receita total",   num(ag._sum.valor) + num(ag._sum.up1_valor) + num(ag._sum.up2_valor) + num(ag._sum.ds_valor), 324);

  /* ── 2. /api/us/pedidos — cada filtro dos cards ── */
  console.log("\n── /api/us/pedidos (filtros dos cards) ──");
  const FILTROS = {
    todos:        [{}, 14],
    pagos:        [{ status: "pago" }, 13],
    pendentes:    [{ status: "pago", entrega_email: false }, 2],
    erro:         [{ status: "pago", gerou_musica: false, entrega_email: false }, 1],
    pendentes_up: [{ up2_status: "pago", up_entrega_email: false }, 2],
    erro_up:      [{ up2_status: "pago", up_gerou_musica: false, up_entrega_email: false }, 1],
    up1:          [{ up1_status: "pago" }, 4],
    up2:          [{ up2_status: "pago" }, 5],
    ds:           [{ ds_status: "pago" }, 2],
  };
  for (const [nome, [extra, esperado]] of Object.entries(FILTROS)) {
    checar(`filtro=${nome}`, await prisma.pedidoUs.count({ where: w(extra) }), esperado);
  }

  /* ── 3. filtro por plano ── */
  console.log("\n── filtro por plano ──");
  const PLANOS = {
    basic: 4, basic_up1: 1, basic_up2: 2, basic_up1_up2: 1, basic_ds: 1,
    silver: 1, silver_up1: 1, silver_up2: 1, silver_up1_up2: 1, silver_ds: 1,
  };
  let somaPlanos = 0;
  for (const [plano, esperado] of Object.entries(PLANOS)) {
    const n = await prisma.pedidoUs.count({ where: w({ plano }) });
    somaPlanos += n;
    checar(`plano=${plano}`, n, esperado);
  }
  checar("soma dos planos cobre os de teste", somaPlanos, 14);

  /* ── 4. Regras do funil ── */
  console.log("\n── invariantes do funil ──");

  // A automação gera a página Premium de TODA música gerada, independente de up1/ds.
  // up1 e ds decidem apenas se o link é entregue ao cliente no envio final.
  checar("musica gerada sem link_pagina (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({ gerou_musica: true, link_pagina: null }) }), 0);

  checar("paginas Premium geradas",
    await prisma.pedidoUs.count({ where: w({ link_pagina: { not: null } }) }), 12);

  // O direito à entrega é avaliado em JS, igual ao que a tela de detalhe faz.
  // Em SQL, `NOT (a = 'pago' OR b = 'pago')` descarta linhas onde b é NULL.
  const comPagina = await prisma.pedidoUs.findMany({
    where: w({ link_pagina: { not: null } }),
    select: { up1_status: true, ds_status: true },
  });
  const entregues = comPagina.filter(
    (p) => p.up1_status === "pago" || p.ds_status === "pago",
  ).length;

  checar("dessas, entregues ao cliente (up1 ou ds pago)", entregues, 6);
  checar("dessas, geradas mas NAO entregues", comPagina.length - entregues, 6);

  // Os slots 2 e 3 só existem quando o upsell 2 foi pago
  checar("song_id2 sem up2 nem ds pago (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({
      song_id2: { not: null },
      NOT: { OR: [{ up2_status: "pago" }, { ds_status: "pago" }] },
    }) }), 0);
  checar("song_id3 sem song_id2 (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({ song_id3: { not: null }, song_id2: null }) }), 0);
  checar("pedidos com as 3 musicas geradas",
    await prisma.pedidoUs.count({ where: w({ song_id: { not: null }, song_id2: { not: null }, song_id3: { not: null } }) }), 6);

  // As músicas extras também têm a página gerada sempre
  checar("musica 2 gerada sem link_pagina2 (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({ song_id2: { not: null }, link_pagina2: null }) }), 0);
  checar("musica 3 gerada sem link_pagina3 (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({ song_id3: { not: null }, link_pagina3: null }) }), 0);
  checar("paginas Premium geradas na musica 2",
    await prisma.pedidoUs.count({ where: w({ link_pagina2: { not: null } }) }), 6);
  checar("paginas Premium geradas na musica 3",
    await prisma.pedidoUs.count({ where: w({ link_pagina3: { not: null } }) }), 6);

  // O downsell só é ofertado depois de up1 e up2 recusados
  checar("ds ofertado apos up1/up2 pago (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({ ds_status: { not: null }, OR: [{ up1_status: "pago" }, { up2_status: "pago" }] }) }), 0);

  // O plano tem que refletir os status das ofertas
  checar("plano com up1 mas up1 nao pago (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({ plano: { contains: "up1" }, NOT: { up1_status: "pago" } }) }), 0);
  checar("plano com up2 mas up2 nao pago (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({ plano: { contains: "up2" }, NOT: { up2_status: "pago" } }) }), 0);
  checar("plano com ds mas ds nao pago (deve ser 0)",
    await prisma.pedidoUs.count({ where: w({ plano: { endsWith: "_ds" }, NOT: { ds_status: "pago" } }) }), 0);

  /* ── 5. /api/us/search ── */
  console.log("\n── /api/us/search ──");
  const busca = async (q) => (await prisma.pedidoUs.findMany({
    where: w({ OR: [{ email: { contains: q, mode: "insensitive" } }, { id: { contains: q, mode: "insensitive" } }] }),
    take: 50,
  })).length;
  checar("busca por email exato",   await busca("james-whitaker@example.com"), 1);
  checar("busca por prefixo de id", await busca("cs_test_"), 14);
  checar("busca sem resultado",     await busca("naoexiste@x.com"), 0);

  /* ── 6. Paginação (LIMIT 50 das rotas) ── */
  console.log("\n── paginacao ──");
  checar("pagina 1 traz os 14", (await prisma.pedidoUs.findMany({ where: w(), skip: 0, take: 50 })).length, 14);
  checar("pagina 2 vazia",      (await prisma.pedidoUs.findMany({ where: w(), skip: 50, take: 50 })).length, 0);

  /* ── 7. Isolamento entre as operações ── */
  console.log("\n── isolamento BR / US ──");
  checar("nenhum pedido de teste vazou para a tabela Pedido",
    await prisma.pedido.count({ where: { id: { startsWith: "cs_test_" } } }), 0);
  console.log(`  info  tabela Pedido (BR) segue com ${(await prisma.pedido.count()).toLocaleString("pt-BR")} pedidos`);

  console.log(`\n${"=".repeat(64)}`);
  console.log(`${ok} verificacoes passaram, ${falhou} falharam.`);
  console.log("=".repeat(64));

  await prisma.$disconnect();
  process.exit(falhou > 0 ? 1 : 0);
})().catch(async (e) => {
  console.error("Erro:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
