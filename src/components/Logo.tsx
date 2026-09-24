'use client';

import * as React from 'react';
import { logoCandidates } from '@/lib/cards';
import { cn } from '@/lib/cn';

/**
 * Logotipo de uma marca, buscado pelo domínio.
 *
 * Nenhuma das fontes públicas cobre todas as marcas brasileiras, então elas são
 * tentadas em ordem e a primeira que responder fica. Quando nenhuma responde,
 * entram as iniciais sobre a cor da marca — que é o estado normal de um serviço
 * que a pessoa cadastrou à mão, não uma falha.
 */
export function Logo({
  domain,
  initials,
  color,
  size = 40,
  radius = 12,
  className,
}: {
  domain: string;
  initials: string;
  color: string;
  size?: number;
  radius?: number;
  className?: string;
}) {
  const sources = React.useMemo(() => logoCandidates(domain), [domain]);
  const [step, setStep] = React.useState(0);
  const [loadedDomain, setLoadedDomain] = React.useState(domain);

  // trocar de serviço reinicia a cascata; sem isto a marca nova herdaria o
  // "desisti de carregar" da anterior. Ajustar aqui, durante o render, evita
  // o quadro intermediário que um efeito produziria.
  if (loadedDomain !== domain) {
    setLoadedDomain(domain);
    setStep(0);
  }

  const src = sources[step];

  return (
    <span
      className={cn('grid shrink-0 place-items-center overflow-hidden', className)}
      style={{ width: size, height: size, borderRadius: radius, background: color }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setStep((s) => s + 1)}
          className="h-full w-full object-contain"
        />
      ) : (
        <span
          className="font-semibold text-white mix-blend-luminosity"
          style={{ fontSize: Math.max(11, size * 0.34) }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
