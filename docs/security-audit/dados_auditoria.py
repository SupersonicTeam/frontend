# -*- coding: utf-8 -*-
"""
Dados da auditoria de seguranca do AgroContabil.

Separado do renderizador (`gerar_relatorio.py`) de proposito: quando um achado for
corrigido, edite so este arquivo e rode o gerador de novo.

Cada achado foi verificado no codigo-fonte real; os que tem `prova_ao_vivo` foram
tambem confirmados contra o backend rodando em localhost:8080.
"""

PROJETO = "AgroContábil"
DATA = "24 de setembro de 2026"

ESCOPO = [
    ("Frontend", "SupersonicTeam/frontend — Angular 21 standalone/zoneless, Tailwind v4. "
                 "Auditado por completo (src/, configs, environments, proxy)."),
    ("Backend", "SupersonicTeam/backend — Spring Boot 3.5.14 (Java 21), Spring Security, "
                "Spring Data JPA, PostgreSQL 16 + Liquibase. Auditado em modo LEITURA: "
                "8 controllers, 22 services, 14 repositories, 3 profiles de configuração, "
                "compose.yaml, Dockerfile e histórico git."),
    ("Fora do escopo", "Infraestrutura de produção (não existe ainda), pipeline de deploy "
                       "e o app React `agro-simples-vista`, que não é o frontend ativo."),
]

NOTA_METODOLOGICA = """As cinco categorias pedidas foram mapeadas para a stack detectada antes da análise:

1. BANCO SEM TRANCA — o projeto não usa Supabase, portanto não há RLS. O mecanismo de isolamento
   real é de aplicação: o componente AuthenticatedProdutorProvider lê o Produtor do
   SecurityContextHolder e os repositórios expõem variantes com dono embutido
   (findByIdAndProdutorId / findByProdutorId). A auditoria verificou, service por service, se esse
   par é usado — e onde não é.

2. PERMISSÃO NO NAVEGADOR — cada gate de papel do Angular (perfilService.ehContador/ehProdutor,
   perfilGuard) foi cruzado com a rota de backend correspondente para confirmar se existe
   verificação equivalente no servidor.

3. IDOR — todos os 20 handlers dos 8 controllers foram percorridos, não uma amostra. Para cada um,
   rastreou-se o caminho controller → service → repository até a query final.

4. CHAVES EXPOSTAS — varredura em application.yml e nos 2 profiles, compose.yaml, Dockerfile,
   .env/.env.example, environments do Angular e no histórico git completo dos dois repositórios,
   com atenção ao padrão ${VAR:default} e à ausência de validação de startup.

5. INPUTS SEM TRATAMENTO — no Angular, busca por innerHTML, bypassSecurityTrust, eval, new Function,
   document.write, insertAdjacentHTML e href/src dinâmicos. No backend, o caminho do input do
   usuário até o XML da NF-e e o PDF gerados.

Três achados foram confirmados por requisição real contra o backend em execução (localhost:8080),
sempre com métodos de leitura — nenhuma escrita foi feita no banco do projeto."""

SEV = {
    "critica": ("Crítica", "#B91C1C"),
    "alta": ("Alta", "#EA580C"),
    "media": ("Média", "#D97706"),
    "baixa": ("Baixa", "#2563EB"),
    "info": ("Informativa", "#6B7280"),
}
COR_FORTE = "#059669"

CATEGORIAS = {
    "c1": "1. Banco sem tranca (isolamento de dono)",
    "c2": "2. Permissão definida no navegador",
    "c3": "3. IDOR",
    "c4": "4. Chaves expostas",
    "c5": "5. Inputs sem tratamento (XSS)",
}

ACHADOS = [
    {
        "id": "A1",
        "sev": "critica",
        "cat": "c1",
        "cats_extra": ["c2", "c3"],
        "titulo": "API inteira sem autenticação — todos os endpoints são públicos",
        "local": "backend/src/main/java/br/com/agrocontabil/config/SecurityConfig.java:46-51",
        "codigo": """.authorizeHttpRequests(
    auth ->
        auth
            // TODO[Sprint 8 - Auth]: substituir por regras reais (.authenticated())
            // e adicionar o filtro JWT antes do UsernamePasswordAuthenticationFilter.
            .anyRequest().permitAll());""",
        "porque": "Não existe nenhuma regra de autorização: `anyRequest().permitAll()` libera os 20 "
                  "endpoints da API, incluindo emissão de NF-e, cancelamento junto à SEFAZ, exclusão "
                  "de notas e download da DANFE. Qualquer pessoa com acesso de rede à porta 8080 "
                  "executa qualquer operação. Esta é a causa-raiz das categorias 1, 2 e 3: todo o "
                  "isolamento por produtor descrito abaixo se apoia num principal que nunca é "
                  "provado por credencial alguma.",
        "prova_ao_vivo": "curl sem qualquer header contra GET /api/dashboard devolveu HTTP 200 com os "
                         "dados financeiros completos do produtor.",
        "impacto": "Leitura, alteração e exclusão de documentos fiscais por qualquer um. Emissão e "
                   "cancelamento de NF-e em nome do produtor. Em produção, isso é fraude fiscal "
                   "viabilizada pela aplicação.",
        "condicao": "Exploração direta, sem pré-condição. Hoje o serviço só escuta em localhost, o que "
                    "limita o alcance ao ambiente de desenvolvimento — mas nada no código impede a "
                    "exposição.",
        "correcao": "Trocar `permitAll()` por `.authenticated()` com allowlist explícita para "
                    "/actuator/health e o health público; plugar o filtro JWT (jjwt já está no pom.xml) "
                    "antes do UsernamePasswordAuthenticationFilter.",
    },
    {
        "id": "A2",
        "sev": "critica",
        "cat": "c1",
        "cats_extra": [],
        "titulo": "Profile `dev` é o padrão e autentica qualquer requisição como o produtor de teste",
        "local": "backend/src/main/resources/application.yml:7 · "
                 "config/MockProdutorFilter.java:17-19,35-42 · compose.yaml:31",
        "codigo": """# application.yml:7
    active: ${SPRING_PROFILES_ACTIVE:dev}

// MockProdutorFilter.java:17-19, 35-41
@Component
@Profile("dev")
public class MockProdutorFilter extends OncePerRequestFilter {
  ...
  if (SecurityContextHolder.getContext().getAuthentication() == null) {
    Produtor produtor = getOrLoadMockProdutor();          // busca por CPF fixo "123.456.789-00"
    if (produtor != null) {
      UsernamePasswordAuthenticationToken auth =
          new UsernamePasswordAuthenticationToken(produtor, null, List.of());
      SecurityContextHolder.getContext().setAuthentication(auth);   // <- sem credencial
    }
  }

# compose.yaml:31 — o container do backend fixa o profile inseguro
      SPRING_PROFILES_ACTIVE: dev""",
        "porque": "Se a variável SPRING_PROFILES_ACTIVE não for definida, a aplicação sobe em `dev` — e "
                  "o dev registra um filtro que injeta um Produtor autenticado em TODA requisição sem "
                  "pedir credencial. O compose.yaml ainda crava `dev` no serviço do backend (linha 31), "
                  "então subir o projeto com Docker Compose ativa a auto-autenticação por padrão. "
                  "Não existe nenhuma verificação de startup que recuse o profile `dev` fora do "
                  "ambiente local.",
        "prova_ao_vivo": "Requisição sem cabeçalho de autenticação retornou dados do produtor "
                         "'João da Silva Produtor' — o principal veio do MockProdutorFilter.",
        "impacto": "Um deploy que esqueça a variável de ambiente entrega a base inteira de um produtor "
                   "a qualquer visitante, sem sequer o sintoma de uma tela de login quebrada.",
        "condicao": "Basta a ausência de SPRING_PROFILES_ACTIVE=prod; com Docker Compose, o valor "
                    "inseguro é explícito no arquivo.",
        "correcao": "Inverter o default para `prod` em application.yml; mover o SPRING_PROFILES_ACTIVE "
                    "do compose.yaml para o .env; e adicionar um ApplicationRunner que aborte o boot se "
                    "o profile `dev` estiver ativo junto de um DB_HOST que não seja local.",
    },
    {
        "id": "A3",
        "sev": "alta",
        "cat": "c3",
        "cats_extra": ["c1"],
        "titulo": "GET /api/contador/guias aceita qualquer produtorId — enumeração de guias de terceiros",
        "local": "backend/.../controller/GuiaFiscalController.java:95-98 → "
                 "service/GuiaFiscalService.java:75-80",
        "codigo": """// GuiaFiscalController.java:95-98
public ResponseEntity<List<GuiaFiscalResponse>> listar(
    @RequestParam UUID produtorId) {                       // <- vem do cliente
  return ResponseEntity.ok(guiaFiscalService.listar(produtorId));
}

// GuiaFiscalService.java:75-80 — nenhuma checagem de dono
@Transactional(readOnly = true)
public List<GuiaFiscalResponse> listar(UUID produtorId) {
  return guiaFiscalRepository.findByProdutorIdOrderByDataVencimentoDesc(produtorId).stream()
      .map(GuiaFiscalMapper::toResponse)
      .toList();
}""",
        "porque": "O produtorId chega por query string e vai direto à query, sem ser confrontado com o "
                  "produtor autenticado. O contraste com o endpoint de calendário é a prova: "
                  "CalendarioFiscalService.java:51-54 faz exatamente essa comparação e devolve 404. "
                  "Aqui ela não existe. Trocando o UUID da URL, lê-se as guias fiscais de qualquer "
                  "produtor: tipo de tributo, valor, vencimento e se está paga.",
        "prova_ao_vivo": "GET /api/contador/guias?produtorId=<uuid-arbitrário> respondeu HTTP 200 "
                         "(enquanto GET /api/calendario-fiscal/<mesmo-uuid>/vencimentos respondeu 404, "
                         "confirmando que a verificação existe num endpoint e falta no outro).",
        "impacto": "Vazamento da posição fiscal de outros produtores — quanto devem, de que tributo e "
                   "se estão inadimplentes.",
        "condicao": "Nenhuma. O código documenta a ausência como débito conhecido "
                    "(\"sem autenticação de Contador\", GuiaFiscalService.java:23-28), o que explica a "
                    "origem mas não reduz a exploração.",
        "correcao": "Enquanto não existir RBAC de contador, comparar o produtorId com o autenticado e "
                    "devolver 404 na divergência — o mesmo padrão de CalendarioFiscalService:51-54. "
                    "Com RBAC, autorizar pelo vínculo contador↔produtor.",
    },
    {
        "id": "A4",
        "sev": "alta",
        "cat": "c3",
        "cats_extra": ["c1"],
        "titulo": "POST /api/contador/guias grava cobrança na conta de qualquer produtor",
        "local": "backend/.../controller/GuiaFiscalController.java:72-74 → "
                 "service/GuiaFiscalService.java:57-64",
        "codigo": """// GuiaFiscalService.java:57-64 — o produtorId vem do corpo e e apenas resolvido
public GuiaFiscalResponse criar(GuiaFiscalRequest request) {
  Produtor produtor = produtorRepository.findById(request.produtorId())
      .orElseThrow(() -> new ResourceNotFoundException("Produtor", request.produtorId()));

  GuiaFiscal guia = GuiaFiscalMapper.toEntity(request, produtor);
  GuiaFiscal salva = guiaFiscalRepository.save(guia);      // <- grava para outro dono
  return GuiaFiscalMapper.toResponse(salva);
}""",
        "porque": "O produtorId do corpo é usado apenas para carregar a entidade destino — nunca para "
                  "verificar se quem chama pode escrever nela. É uma escrita cross-tenant: qualquer "
                  "chamador cria uma guia fiscal, com valor e vencimento arbitrários, na conta de "
                  "outro produtor. Mais grave que A3, porque altera dados em vez de só lê-los.",
        "prova_ao_vivo": "Não executado — seria uma escrita no banco de demonstração do TCC. O achado "
                         "vem da leitura do código e da ausência comprovada de qualquer checagem.",
        "impacto": "Poluição da apuração alheia com cobranças falsas; o produtor vítima vê dívidas que "
                   "não existem. Combinado com A1, a escrita é anônima.",
        "condicao": "Nenhuma além de conhecer um produtorId válido — que A3 entrega.",
        "correcao": "Mesma correção de A3: validar o vínculo antes de gravar. A rota vive sob "
                    "/api/contador, então ela deveria exigir o papel de contador assim que o RBAC "
                    "existir.",
    },
    {
        "id": "A5",
        "sev": "alta",
        "cat": "c2",
        "cats_extra": [],
        "titulo": "O papel \"Contador\" existe somente no navegador — servidor não conhece papéis",
        "local": "frontend/src/app/core/services/perfil.service.ts:27-31 · "
                 "core/guards/perfil.guard.ts:9-13 · app.routes.ts:36-39 · "
                 "shared/layout/app-layout/app-layout.html:208,265",
        "codigo": """// perfil.service.ts:27-31 — "login" sem senha, so escreve no localStorage
entrar(perfil: Perfil, nome?: string): void {
  this.perfil.set(perfil);
  this.nome.set(nome?.trim() || this.rotuloPadrao(perfil));
  this.persistir();                      // localStorage: agrocontabil.perfil
}

// perfil.guard.ts:9-13 — so verifica se ha ALGUM perfil, nao QUAL
export const perfilGuard: CanActivateFn = () => {
  const perfil = inject(PerfilService);
  const router = inject(Router);
  return perfil.logado() ? true : router.createUrlTree(['/login']);
};

// app.routes.ts:36-39 — a rota do contador nao tem guarda de papel
{
  path: 'contador',
  loadComponent: () => import('@pages/contador/contador').then((m) => m.ContadorPage),
},""",
        "porque": "A experiência do Contador é escondida por `@if (perfilService.ehContador())` no "
                  "app-layout (linhas 208 e 265), mas o valor vem de localStorage escrito por um login "
                  "sem senha. Basta `localStorage.setItem('agrocontabil.perfil','contador')` no console "
                  "— ou navegar direto para /contador, que não tem guarda de papel — para obter a "
                  "interface inteira. No servidor não existe conceito de papel: o SecurityConfig não "
                  "tem nenhuma regra `hasRole`, e a própria GuiaFiscalService:23 registra que não há "
                  "entidade de Contador.",
        "prova_ao_vivo": "Não requer exploração: a rota /contador é carregada pelo perfilGuard, que "
                         "aprova qualquer perfil, e os endpoints /api/contador/* são permitAll.",
        "impacto": "Limitado hoje porque o backend não oferece nada exclusivo ao contador além das "
                   "guias (já cobertas por A3/A4). O risco real é de regressão: quando um endpoint "
                   "privilegiado for adicionado sob /api/contador, o frontend vai parecer protegê-lo.",
        "condicao": "Nenhuma. É uma decisão consciente do \"login de sabor\" (issue #23) e o código diz "
                    "isso; o achado documenta que a proteção é cosmética, não que seja um descuido.",
        "correcao": "Marcar explicitamente como demonstração até a Sprint 8 e, ao implementar o RBAC, "
                    "derivar o papel de uma claim do JWT e proteger /api/contador/** com `hasRole` no "
                    "servidor antes de reativar qualquer gate visual.",
    },
    {
        "id": "A6",
        "sev": "media",
        "cat": "c4",
        "cats_extra": [],
        "titulo": "Segredos com valor padrão embutido e sem validação de startup",
        "local": "backend/src/main/resources/application-dev.yml:7,46 · "
                 "application-prod.yml:28 · application.yml:7",
        "codigo": """# application-dev.yml:7 — senha do banco vira "agrocontabil" se a env faltar
    password: ${DB_PASSWORD:agrocontabil}

# application-dev.yml:46 — senha do certificado de assinatura da NF-e
      password: ${NFE_CERT_PASSWORD:changeit}

# application-prod.yml:28 — segredo do JWT aceita string VAZIA como default
    jwt-secret: ${JWT_SECRET:}""",
        "porque": "São exatamente os defaults públicos que viram segredo real quando ninguém "
                  "sobrescreve. O mais perigoso é o `JWT_SECRET:` do profile de produção: aceita vazio "
                  "silenciosamente, e uma busca por @PostConstruct, ApplicationRunner ou @Validated "
                  "sobre essa propriedade não encontra nenhuma validação de inicialização. Quando a "
                  "Sprint 8 ligar o JWT, a aplicação vai subir com segredo vazio e assinar tokens "
                  "forjáveis, sem nenhum aviso. A senha `agrocontabil` do banco é conhecida por estar "
                  "no repositório público.",
        "prova_ao_vivo": "Não aplicável — é análise de configuração.",
        "impacto": "Segredo de JWT vazio permite forjar token de qualquer produtor assim que a "
                   "autenticação for ligada. Senha de banco previsível facilita acesso direto ao "
                   "PostgreSQL se a porta 5432 estiver alcançável.",
        "condicao": "Requer que as variáveis de ambiente não sejam definidas. O `.env.example` orienta "
                    "corretamente (CHANGE_ME), mas nada impede o boot sem ele.",
        "correcao": "Remover o default de todo valor que seja segredo (deixar `${JWT_SECRET}` sem "
                    "dois-pontos faz o Spring falhar o boot). Adicionar um ApplicationRunner que "
                    "recuse iniciar em `prod` com JWT_SECRET vazio ou com menos de 32 caracteres.",
    },
    {
        "id": "A7",
        "sev": "baixa",
        "cat": "c4",
        "cats_extra": [],
        "titulo": "Swagger UI e contrato OpenAPI públicos em qualquer profile",
        "local": "backend/src/main/resources/application.yml:93-95",
        "codigo": """springdoc:
  swagger-ui:
    path: /swagger-ui.html""",
        "porque": "O springdoc é habilitado no profile base e nenhum dos dois profiles o desliga. "
                  "Somado ao permitAll de A1, o contrato completo da API — todos os caminhos, "
                  "parâmetros e formatos — fica navegável por qualquer um. Isso não é uma falha em si, "
                  "mas encurta o caminho para explorar A3 e A4, que dependem de conhecer o formato "
                  "do produtorId.",
        "prova_ao_vivo": "/api/docs e /swagger-ui.html respondem sem autenticação.",
        "impacto": "Reconhecimento facilitado. Baixo isoladamente.",
        "condicao": "Só importa quando a API estiver exposta fora do localhost.",
        "correcao": "Desabilitar springdoc no profile prod (`springdoc.api-docs.enabled: false`) ou "
                    "restringir a rota a usuários autenticados.",
    },
    {
        "id": "A8",
        "sev": "info",
        "cat": "c4",
        "cats_extra": [],
        "titulo": "Certificado .p12 versionado no repositório (verificado: é de teste, sem valor jurídico)",
        "local": "backend/src/test/resources/certs/nfe-teste.p12 (+ README.md) · "
                 "senha 'changeit' em 4 arquivos de teste",
        "codigo": """// KeyStoreCertificadoProviderTest.java:16
var props = new CertificadoDigitalProperties(TEST_P12, "changeit", "nfe-teste");

# src/test/resources/certs/README.md
`nfe-teste.p12` e um certificado **autoassinado** A1 (RSA 2048), exclusivo para testes.
NAO tem valor juridico e NAO e aceito pela SEFAZ. Senha/alias: `changeit` / `nfe-teste`.""",
        "porque": "Um keystore versionado costuma ser achado crítico, então foi verificado em vez de "
                  "presumido: o README documenta a geração via keytool como autoassinado, e a busca no "
                  "histórico git completo não encontrou nenhum outro .p12/.pfx/.jks/.pem/.key. "
                  "Registrado como informativo por transparência — não é vazamento.",
        "prova_ao_vivo": "Histórico git dos dois repositórios varrido com "
                         "`git log --all --diff-filter=A` filtrando extensões de chave: apenas este "
                         "arquivo.",
        "impacto": "Nenhum. O certificado não assina nada aceito pela SEFAZ.",
        "condicao": "Viraria um achado real se alguém substituísse o arquivo por um ICP-Brasil real "
                    "mantendo o caminho versionado.",
        "correcao": "Manter como está. Garantir que `*.p12` fora de src/test/resources continue no "
                    ".gitignore.",
    },
]

PONTOS_FORTES = [
    {
        "titulo": "Padrão anti-IDOR aplicado com consistência em 15 dos 17 pontos com dono",
        "evidencia": "NotaFiscalService (create:101, findAll:119-121, findById:137-139, update:159-161, "
                     "delete:221-223, gerarXml:271-273, obterXml:313-315, gerarPdf:342-344), "
                     "SefazService (enviar:107-109, sincronizarStatus:152-154, cancelar:209-211), "
                     "NotaFiscalValidacaoService.listarValidacoes:118-121, ApuracaoService:223-225, "
                     "ImportacaoNotaFiscalService:87 e GuiaFiscalService.marcarComoPaga:92-93 — todos "
                     "resolvem o produtor pelo AuthenticatedProdutorProvider e carregam o recurso por "
                     "findByIdAndProdutorId, devolvendo 404 (nunca 403, que confirmaria a existência).",
    },
    {
        "titulo": "Verificação explícita de dono no endpoint que recebe produtorId pelo path",
        "evidencia": "CalendarioFiscalService.java:51-54 compara o produtorId do path com o autenticado "
                     "e lança ResourceNotFoundException na divergência. Confirmado ao vivo: HTTP 404 "
                     "para UUID de terceiro. É a implementação correta que falta em A3/A4.",
    },
    {
        "titulo": "Agregações do dashboard filtram por produtor na própria query",
        "evidencia": "NotaFiscalRepository: as quatro @Query JPQL (linhas 93, 128, 165 e 202) têm "
                     "`WHERE n.produtor.id = :produtorId`, inclusive a que faz GROUP BY por mês. "
                     "Não há agregação global vazando totais entre produtores.",
    },
    {
        "titulo": "Parsing de XML com hardening XXE completo",
        "evidencia": "SecureXmlFactories.java:36-42 desativa DOCTYPE, entidades gerais e de parâmetro "
                     "externas e carga de DTD, e liga FEATURE_SECURE_PROCESSING. Aplicado em "
                     "NfeXmlImporter:136, NfeAssinador:104 e AssinaturaValidator:86 — ou seja, em todo "
                     "ponto que lê XML de terceiro, que é a superfície de risco do upload de NF-e.",
    },
    {
        "titulo": "XML da NF-e gerado por marshaller, não por concatenação de string",
        "evidencia": "XmlGenerator.java:44 usa JAXB Marshaller sobre o grafo de objetos. Nomes de "
                     "destinatário e descrições de produto são escapados pelo marshaller — não há "
                     "caminho de injeção de tag no XML enviado à SEFAZ.",
    },
    {
        "titulo": "Frontend Angular sem nenhum sink de XSS",
        "evidencia": "Varredura em todo o src/ por innerHTML, outerHTML, insertAdjacentHTML, "
                     "bypassSecurityTrust*, document.write, eval e new Function: zero ocorrências. "
                     "Toda interpolação passa pelo escape padrão do Angular. Não há renderização de "
                     "Markdown nem de HTML vindo da API — inclusive na tela do assistente, que é o "
                     "lugar onde texto de terceiro entraria.",
    },
    {
        "titulo": "Nenhum segredo no frontend nem no histórico dos repositórios",
        "evidencia": "environment.ts e environment.prod.ts contêm apenas `apiUrl: '/api'`. Busca por "
                     "api_key/secret/token/password com valor literal em src/: nenhuma ocorrência. "
                     "O `.env` do backend não é rastreado pelo git (`git ls-files` não o encontra) e o "
                     ".gitignore cobre `.env` e `*.env` com exceção para `.env.example`, que usa "
                     "CHANGE_ME como placeholder.",
    },
    {
        "titulo": "Superfície do Actuator restrita",
        "evidencia": "application.yml:104 expõe apenas `health,info`; application-prod.yml:34 define "
                     "`show-details: never`. Não há /env, /heapdump ou /mappings acessíveis.",
    },
    {
        "titulo": "Sessão stateless e CSRF desativado pelo motivo certo",
        "evidencia": "SecurityConfig.java:43-45: CSRF desabilitado junto de SessionCreationPolicy."
                     "STATELESS. Numa API sem cookie de sessão, é a configuração correta — não é o "
                     "anti-padrão de desligar CSRF mantendo sessão com cookie.",
    },
]

RECOMENDACOES = [
    ("P1", "Ligar autenticação antes de qualquer exposição fora do localhost",
     "Resolve A1 e A2, que são a causa-raiz. Trocar o permitAll por .authenticated(), plugar o filtro "
     "JWT (jjwt já está no pom.xml) e inverter o default do profile para `prod`. Enquanto isso não "
     "acontecer, manter o backend acessível apenas em rede local — o que já é o caso hoje.",
     ["A1", "A2"]),
    ("P2", "Fechar os dois furos de isolamento nas guias fiscais",
     "A3 e A4 são correções pequenas e independentes da Sprint de autenticação: comparar o produtorId "
     "recebido com o autenticado e devolver 404 na divergência, replicando CalendarioFiscalService:"
     "51-54. É o melhor retorno por esforço de toda a lista.",
     ["A3", "A4"]),
    ("P3", "Fazer o boot falhar com segredo ausente em produção",
     "Remover o default de JWT_SECRET, DB_PASSWORD e NFE_CERT_PASSWORD e adicionar validação de "
     "inicialização. Precisa estar pronto ANTES da Sprint 8, senão o JWT nasce com segredo vazio.",
     ["A6"]),
    ("P4", "Tratar o papel de Contador como RBAC de servidor quando ele existir",
     "Documentar o estado atual como demonstração e, ao criar a entidade de Contador, proteger "
     "/api/contador/** com hasRole antes de confiar em qualquer gate visual.",
     ["A5"]),
    ("P5", "Reduzir a superfície de reconhecimento",
     "Desabilitar o Swagger UI no profile de produção. Baixa prioridade: só passa a importar depois "
     "que P1 estiver feito e a API for exposta.",
     ["A7"]),
]

NAO_APLICAVEL = [
    ("RLS de banco (Supabase)", "O projeto usa PostgreSQL direto com Spring Data JPA. Não há Row Level "
                                "Security e nem seria o mecanismo esperado nesta arquitetura — o "
                                "isolamento é de aplicação e foi auditado como tal."),
    ("XSS no backend via e-mail/template", "Não há envio de e-mail nem engine de template HTML "
                                           "(Thymeleaf/Freemarker) no projeto. As respostas são JSON, "
                                           "XML (marshaller) e PDF."),
    ("Infraestrutura como código", "Não existem Helm charts, Terraform nem workflows de deploy. O CI do "
                                   "frontend roda apenas lint, build e test e não manuseia segredos."),
]
