# Patotas — PWA de demonstração

Site estático em HTML/CSS/JavaScript puro. Não há login, backend ou recebimento de pagamentos.

## Publicar no GitHub Pages

1. Crie um repositório chamado `patotas` no GitHub (público, se usar Pages gratuito).
2. Faça upload **dos arquivos e da pasta `icons` de dentro deste ZIP**, preservando sua estrutura, na raiz do repositório (não envie o ZIP como único arquivo).
3. Em **Settings > Pages**, escolha **Deploy from a branch** e selecione **main / (root)**. Salve.
4. Após a publicação, abra `https://SEU-USUARIO.github.io/patotas/` no Safari.
5. No Safari, toque em **Compartilhar > Adicionar à Tela de Início** e abra pelo ícone Patotas.

## Testes

- Setembro/2026 contém João; Outubro/2026 não contém João.
- Carlos tem uma mensalidade atrasada em setembro; Ana pode aparecer como antecipada em outubro.
- Clique em um membro ou mensalidade para abrir detalhes/registrar datas reais de pagamento.
- Em Ajustes, exporte/importa um backup JSON. Nunca use 'Restaurar dados fictícios' com dados reais sem backup.

## Limitações importantes

- A instalação PWA exige hospedagem HTTPS ou localhost, não funciona corretamente pelo visualizador de arquivo HTML do iPhone.
- Dados ficam no armazenamento deste dispositivo e perfil de navegador. Limpar dados do Safari ou excluir o PWA pode apagar registros; exporte backups periodicamente.
- Offline funciona **após o primeiro acesso online e instalação/caching concluído**.
- Apps PWA instalados e Safari podem ter armazenamentos separados dependendo do iOS. Não conte com sincronização.
