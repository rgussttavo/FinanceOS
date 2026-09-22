import { NextResponse } from 'next/server';

/**
 * Tabela FIPE, por intermédio do nosso servidor.
 *
 * A consulta é encadeada — marca, modelo, ano, valor — e cada passo é uma
 * chamada. Passando por aqui, o caminho é validado antes de sair: o parâmetro
 * vem do navegador, e repassar caminho livre para um serviço externo é como se
 * abre um proxy aberto sem querer.
 */

export const revalidate = 86400; // a FIPE muda uma vez por mês; um dia de cache sobra

const BASE = 'https://parallelum.com.br/fipe/api/v1';

/** só estes formatos de caminho são aceitos */
const ALLOWED = [
  /^(carros|motos|caminhoes)\/marcas$/,
  /^(carros|motos|caminhoes)\/marcas\/\d{1,6}\/modelos$/,
  /^(carros|motos|caminhoes)\/marcas\/\d{1,6}\/modelos\/\d{1,8}\/anos$/,
  /^(carros|motos|caminhoes)\/marcas\/\d{1,6}\/modelos\/\d{1,8}\/anos\/[\w-]{1,20}$/,
];

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get('path') ?? '';

  if (!ALLOWED.some((rx) => rx.test(path))) {
    return NextResponse.json({ error: 'Caminho não permitido.' }, { status: 400 });
  }

  try {
    const res = await fetch(`${BASE}/${path}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'A FIPE não respondeu.' }, { status: 502 });
    }
    return NextResponse.json(await res.json(), {
      headers: { 'cache-control': `public, s-maxage=${revalidate}, stale-while-revalidate=604800` },
    });
  } catch {
    return NextResponse.json({ error: 'A FIPE não respondeu.' }, { status: 502 });
  }
}
