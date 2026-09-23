import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * O indicador de rota do modo de desenvolvimento fica no canto inferior e
   * cobre o botão de adicionar lançamento, que mora no mesmo lugar. Erros de
   * compilação e de execução continuam aparecendo normalmente.
   */
  devIndicators: false,
};

export default nextConfig;
