# AGENTS.md — Instruções para IAs que trabalham no Patotas

Leia este arquivo antes de alterar o projeto. Estas orientações valem para todas as pastas do repositório, a menos que haja um AGENTS.md mais específico.

## Objetivo
O Patotas é um PWA de controle de membros por competência mensal, mensalidades e multas. Front-end em HTML, CSS e JavaScript puro (módulos ES, sem build), publicado no GitHub Pages. Autenticação (e-mail+senha) e dados ficam no Supabase (Postgres + RLS); o app exige login e não guarda dados em localStorage (só a sessão do supabase-js). Preserve compatibilidade com Safari/iOS e publicação via GitHub Pages. Nunca versione a chave `service_role`.

## Política obrigatória de testes e regressões
1. Para toda mudança de comportamento ou correção de bug, crie ou atualize **testes unitários** das regras afetadas e **testes de integração** dos fluxos envolvidos. Para mudanças puramente visuais, faça no mínimo teste de interface/responsividade e verifique que os fluxos continuam funcionando.
2. Antes de modificar o código, identifique os cenários atuais e inclua um teste que reproduza o bug quando possível; depois implemente a correção.
3. Execute sempre os testes disponíveis e uma verificação de sintaxe do JavaScript **antes de commitar/publicar**. Nunca apresente testes não executados como se tivessem passado.
4. Se ainda não existir infraestrutura de testes, configure uma solução leve e reproduzível apropriada a JavaScript puro (por exemplo, Node.js test runner para regras e Playwright para fluxos no navegador). Documente comandos de instalação e execução. Não adie indefinidamente a criação dos testes por não existir framework.
5. Se o ambiente impedir a execução de testes, explicite essa limitação, descreva quais testes faltaram e não afirme que a alteração foi validada. Corrija erros de sintaxe antes de publicar; prefira não publicar mudanças cujo JS não possa ser minimamente verificado.
6. Não remova ou enfraqueça testes existentes para fazer uma alteração passar. Teste regressões de caminhos felizes, falhas e dados históricos.
7. Depois de mudar arquivos do PWA, confira a estratégia de atualização do service worker/cache para evitar carregar uma mistura de versões antigas e novas.

## Cenários críticos que devem ter cobertura
- Competências são independentes: criar, copiar e apagar membros em um mês não modifica outro mês.
- Copiar membros está disponível apenas quando o mês de destino está vazio. A prévia mostra os nomes da origem; a cópia não traz multas, pagamentos ou isenções.
- Criar e editar membro; editar nome; excluir membro do mês selecionado com confirmação; preservar meses anteriores.
- Isenção de mensalidade: confirmar antes de apagar a mensalidade; cancelar não altera dados; isento não exibe cobrança; multas são independentes.
- Mensalidade: valor do lançamento > 0, data de pagamento obrigatória quando é registrada como paga; permitir antecipação e pagamento atrasado; excluir lançamento sem recriação automática.
- Status de mensalidade não paga: pendente durante/antes da competência, atrasado a partir do mês seguinte; pago exibe a data real; isento tem status próprio.
- Multa: quantidade inteira positiva, valor unitário > 0, data de aplicação ("Data da multa") e data de pagamento opcional e independente; múltiplas multas por membro; cadastro, edição e exclusão.
- Configurações: mensalidade/multa padrão aceitam 0, mas lançamentos exigem valor > 0; "Usa multa" mostra ou oculta controles sem apagar multas existentes.
- Compartilhar mensalidades: lista e status corretos para a data atual, incluindo mês vencido e isentos; clipboard e fallback.
- Persistência no Supabase: recarregar a página não perde dados, RLS isola cada usuário, migrations são aditivas (nunca destroem dados) e funções toleram multas antigas sem data de aplicação (`occurred_at` nulo).
- Autenticação: login, criação de conta com confirmação de e-mail, recuperação de senha e sair; sem sessão o app mostra só o login.
- Interface no Safari/iPhone: modais roláveis, campos de data sem transbordar bordas ou variar de altura, campos condicionais e tema claro/escuro.
- Inicialização: página não pode ficar em branco devido a erro de sintaxe ou exceção; adicionar teste de fumaça que abra a aplicação e verifique a lista/controles básicos.

## Organização e critérios de conclusão
- Prefira extrair lógica pura de datas, status, validação e cópia para módulos testáveis, mantendo o PWA funcional.
- Testes de integração devem simular interação real: selecionar mês → adicionar membro → cadastrar/pagar/excluir mensalidade → adicionar/pagar multa → navegar de volta e verificar histórico.
- Use datas fixas/controladas nos testes, não dependa do relógio real.
- A definição de pronto inclui: comportamento implementado, testes criados/atualizados, testes executados (ou impedimento informado), sintaxe validada e nenhuma regressão conhecida.
- Ao relatar o resultado, informe **quais comandos de teste executou, quantos passaram/falharam e o que não foi possível testar**. Não declare validação no iPhone se não houve teste real no Safari.
- Não publique segredos, dados reais dos membros nem arquivos de armazenamento pessoal no repositório.
