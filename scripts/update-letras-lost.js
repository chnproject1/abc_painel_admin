// Script para atualizar a letra dos registros inseridos sem ela
// Execute: node scripts/update-letras-lost.js
// Produção: DATABASE_URL="postgres://..." node scripts/update-letras-lost.js

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const letras = [
  {
    id: "pix_char_XW5J0gwXe1cWW3d0M3Che4L4",
    letra: "Hoje é seu dia, Daniely, e o sol entrou pela rede do nosso passado |  Lembro do saque no parque, do riso do Denys, foi por ele que eu te encontrei |  Na areia nossos passos se cruzaram e nasceu um caminho de mãos dadas |  Vinte e quatro anos de casados, amor que se fez casa e nunca se cansou de crescer |  Você, professora de sonhos, tocando corações pequenos e pré-adolescentes |  Vejo seus olhos brilhando na sala, cada palavra sua vira cuidado e semente |  É mágico ver você ensinar, transformar dúvidas em asas pra voar |  Daniely, seu jeito de amar é livro aberto que eu nunca paro de folhear |  Trouxemos ao mundo o Kauan, menino de riso fácil e coragem de mar |  E ganhamos um presente maior ainda, Maria Cecília, gerada no ventre da prima Thayse, um rumor de amor no ar |  Foi um laço de família, fé e ternura, um milagre que veio sem explicar |  E o que mais me diverte, meu bem, é como a vida vira jogo e a gente aprende a jogar |  Hoje eu parei de bater na bola, e vocês três começaram a correr pela quadra |  Entre risos e passes, vejo que o nosso amor virou time, virou jornada |  Sua paciência é rede que acolhe, seu abraço é ponto que reconstrói |  Você ensina e eu aprendo todo dia a ser melhor, ao seu lado, Daniely, eu me refaço e me vou |  No quadro da sala você desenha futuros, no nosso lar você escreve canções |  Cada pequeno papo com seu aluno vira sol para as estações |  E eu te celebro hoje, com bolo, com flores, com promessas simples e verdadeiras |  Porque te amar é festa que nunca acaba, é ter você nas manhãs inteiras |  Daniely, meu amor, que a vida te dê mais histórias para contar |  Que os sonhos que você planta germine em crianças que saibam amar |  Eu, Marciano, digo baixinho e digo alto: sou seu, e amo vocês, minha família, meu lar |  Feliz aniversário, minha luz, vamos celebrar cada passo e cada olhar",
  },
  {
    id: "pix_char_Kek3PgycUcFgGEUPTQXr0g24",
    letra: "Rebeka, teus risos pintam o céu da nossa casa |  cada passo teu é festa, cada abraço me atravessa |  quando me chama \"pai\", o tempo aprende a esperar |  tu me cobre de beijo e diz \"eu te amo\" antes de sonhar |  Hoje é teu dia, acende a vela que eu acendo a esperança |  as luzes pequenas tremem como o brilho dos teus olhos |  teu nome dança na sala, feito confete que não cansa |  minha mão na tua mão, firme, mesmo quando o chão é novo |  Rebeka, és canção que me acorda nos dias de silêncio |  teu cheiro de infância guarda memórias que eu quero aprender |  cada riso teu é ponte pra um futuro que me ternaço |  e eu prometo estar aqui, sem pressa, pra te ver crescer |  Feliz aniversário, meu amor, sopra forte e pede o infinito |  tenho mil promessas prontas, um colo, uma história, um abrigo |  quando a vida te desafiar, lembra desses beijos e desse riso |  Rebeka, meu pedaço de céu, meu caminho mais bonito |  Que teus sonhos sejam vastos, que o medo vire coragem |  vou guardar teu sorriso como quem guarda maré e viagem |  sempre que disseres \"pai\", eu volto a ser menino outra vez |  teu beijo me salva, tua voz me chama — e eu respondo \"sou teu, Rebe\"",
  },
  {
    id: "pix_char_qr1BUfMgy1EjLn2yffBTNPte",
    letra: "Hoje a casa acordou mais clara, tem uma festa no ar |  Sopram velas e o tempo sorri, é teu dia de brilhar |  Helena, meu nome canta leve entre os dedos do vento |  És a netinha que trouxe sol, és o nosso encantamento |  Lembro do primeiro choro, do primeiro suspiro teu |  E cada riso foi fazendo caminhos no meu céu |  Aniversário é ponte de sonhos onde a memória se encontra |  E tu vens com olhos de mar, desenhando a vida pronta |  Refrão: Helena, estrela companheira, cresces com doçura e cor |  Refrão: Helena, em cada passo teu a casa se enche de amor |  Teu olhar guarda segredos que só o tempo desvenda |  Teu abraço é um cobertor que afasta toda a tristeza e aprenda |  A netinha que é luz em nossa vida, presente que não tem fim |  Celebramos tua história hoje, celebramos teu jardim |  Vejo nas tuas mãos pequenas a coragem que floresce |  Vejo nos teus pés a estrada que devagar se aquece |  Prometo estar sempre perto, segurar tua mão em cada instante |  Prometo estar sempre perto, mesmo quando eu não estiver mais |  Cantar contigo a canção do horizonte, ser teu porto constante |  Que os anos te deem asas, mas também um colo tranquilo |  Que a alegria te acompanhe e o respeito seja teu estilo |  Hoje dançamos por ti, por cada sonho que brota inteiro |  Hoje cantamos teu nome alto, Helena, nosso primeiro sorriso verdadeiro |  Parabéns, minha netinha, que a vida te seja festa e paz |  E que saibas sempre voltar pra casa, onde o amor te refaz",
  },
  {
    id: "pix_char_te4cdHgdXKWQ5XBGsa6JSpZB",
    letra: "Foi numa mensagem simples no Facebook que tudo começou |  Sete anos e tantos sorrisos depois, ainda guardo aquele \"oi\" como um tesouro |  Vitor, teu nome acende a casa inteira quando eu chamo baixinho |  E cada gesto teu constrói, com carinho, o nosso caminho |  Não foi sorte, foi escolha que a vida insistiu em confirmar |  Nos dias de rotina e nas noites claras, eu só sei te amar |  Você é fio forte que segura, é o colo que acalma minha pressa |  Marido que se planta em paz e pai que ensina com beleza |  Mesmo nas pequenas coisas, no café, no chão, no riso solto |  Eu vejo em teu olhar a prova viva de que o amor é revolto |  A gente cresceu junto, tropeçou, levantou, fez do lar um abrigo |  E eu agradeço sem medida: por ser meu amigo e meu porto seguro infinito |  Quando olho nossos filhos, vejo teu reflexo e penso: valeu a espera |  Tu transformou dias comuns em festa, e a vida em primavera |  Vitor, eu quero dizer alto, com o peito aberto e a voz trêmula |  Que cada instante contigo é poema, cada toque é manta têxtil que me acolhe |  Prometo cuidar do teu riso, ser porto nas tempestades e brisa nas manhãs |  Porque amor assim não se encontra, se constrói com mãos e com afãs |  Obrigada por cada dia, por ser presente, por ser esperança e coragem |  Eu te escolho novamente, hoje e sempre, no mesmo compasso, na mesma margem",
  },
  {
    id: "pix_char_AeUYWxszHK6fqr0gjKZ6ryWf",
    letra: "Depois de vinte anos a rua me trouxe de volta o seu riso |  Agenor entrou pela lembrança e ficou no meu abrigo |  Fomos aprendendo as palavras que o tempo esqueceu de dar |  E eu descobri que primo e destino às vezes sabem se encontrar |  Seu cheiro veio como casa, sua voz como canção antiga |  Cada gesto seu reescreve em mim uma história mais bonita |  Mal disfarço o susto quando seu nome bate no meu peito |  Porque amor que vem devagar às vezes é mais forte e mais perfeito |  Lembro das fotos rasgadas, dos carnavais e dos verões |  Mas nada me preparou pro calor das suas mãos nas minhas mãos |  Agenor, meu primo, meu segredo, meu abrigo e meu furacão |  Deixe eu dizer sem medo que você é inteiro dentro do meu coração |  Eu quero ser quem te segura quando os medos chegarem cedo |  Quero sorrir nos seus planos, dividir a chuva e o aconchego |  Não peço soluções, só a coragem de sermos verdade |  Primo de laços de infância, agora dono da minha saudade |  Se o mundo julgar diferente, que julgue o amor que nos chama |  Prefiro mil vezes errar sendo feliz do que viver na cama |  Da dúvida e da distância que os anos quiseram impor |  Nosso reencontro virou chama, fez da razão um motor |  Agenor, escuta meu pedido: fica aqui, fica inteiro |  Me deixa provar a certeza de um amor por inteiro |  Não é segredo, não é jogo, é vontade que insiste |  É aprender outro jeito de abraço, outro mapa que a vida desenha |  Se me aceitar pelo que sou, eu te prometo cuidado e paixão |  Porque depois de vinte anos eu te reconheci: você é meu amor, Agenor",
  },
  {
    id: "pix_char_hARLnPBASAGA64myAudpb4uB",
    letra: "Nayara, seu nome é renascer no vento que vem do mar |  Fechei os olhos e senti o mundo encostar no nosso abraço |  Na beira da praia, o tempo fez silêncio para o nosso primeiro beijo |  De frente para a noite, o horizonte acendeu o meu desejo |  Meu amor, minhas mãos aprenderam a ler o contorno do teu rosto |  Cada onda trouxe promessas que guardei como se fossem nossos votos |  As estrelas tremiam quando seus olhos disseram o que eu precisava ouvir |  Senti no sal da pele o gosto de um futuro inteiro ao teu lado |  Nayara, quero ser o abrigo das tuas horas de medo e também de festa |  Quero escrever nossos dias na areia, traços que a maré não leva |  Se o vento trouxer tempestade, serei porto, vela e farol para você |  Meu amor, aceita minha insegurança e a coragem que nasce pra te proteger |  Volta comigo às noites simples, lembra do primeiro beijo que foi começo |  Onde a lua sorriu e a praia guardou o segredo do nosso encontro |  Nayara, toma minha voz, deixa ela cantar só por você todas as manhãs |  Aqui, de frente para o mar, eu declaro: para sempre vou te amar",
  },
  {
    id: "pix_char_53ZeshQQGctRgjp6TCQuxAxL",
    letra: "Te encontrei num compasso de samba, Maely, e o mundo parou por um segundo |  Na viagem à Argentina as ruas sussurravam, mas eu só ouvia sua risada |  Segurei sua mão e senti que era casa, mesmo longe, mesmo sem mapa |  O quarto de frente para a praia guardou nossos sorrisos até o amanhecer |  Acampar com você é maravilhoso, a lua virou lençol e o mar nosso violão |  Meu amor, cada passo seu desenha um caminho que eu quero seguir |  No batuque achei o momento certo de soltar o que o peito guardava |  Maely, eu te chamei sem medo, cada palavra um abrigo para o coração |  As noites que dançamos pareciam promessas vestidas de luz e suor |  Prometo regar nossas manhãs com café, conversa e paciência infinita |  Quero acampar, dormir e acordar, montar e desmontar histórias ao teu lado |  Se o vento levar alguma dúvida, que ele só leve as folhas e traga claridade |  Maely, meu amor, sou porto e sou vela, quero navegar onde você quiser |  Te amo em silêncio e em grito, no samba molhado e na calma da madrugada |  Vem comigo construir pequenas eternidades: uma barraca, um beijo, um caminho |  Eu te declaro agora, simples e inteiro: você é meu lar, minha escolha, minha maré",
  },
  {
    id: "pix_char_snbnrh52NbxqCyyLPSsEcXJs",
    letra: "Noite quente da Bahia, eu tinha quinze e um sonho no olhar |  Segurei você, pequenino, e prometi nunca te deixar |  Dizem que era cedo demais, pediram pra você ser de outra mão |  Mas eu escolhi te criar no peito, te dei destino e chão |  Teu primeiro passo foi promessa, teu choro foi canção |  Saí daquele lar quando você tinha dois, e comecei a nossa mão na mão |  Foram dias de luta, noites sem sono, cafeteria de esperança e fé |  Cada dificuldade virou tijolo, e eu construí um mundo só pra você |  Refrão: Parabéns, meu filho, Yago Daniel, meu sol de julho e mar |  Refrão: Você me fez mãe de verdade, me ensinou a amar sem pensar |  Vi você crescer entre risos e medo, entre tropeços e coragem |  Hoje com dezessete anos, você é meu maior presente nessa viagem |  Olho pra suas costas e vejo força, vejo vida que eu quis sem saber |  Você me fez mulher inteira, me mostrou o melhor de ser |  Lembro dos dias que disseram \"abandone\", eu respondi com minha força e lei |  Nenhuma mão tirou seu nome do meu peito, nenhum conselho venceu o que eu sei |  Você é fruto de um sonho antigo, sou fruto do cuidado que nunca cedeu |  Cada aniversário é vitória: somos nós contra o mundo, eu e você |  Parabéns, Yago Daniel, celebro seu riso, celebro sua vontade de lutar |  Parabéns, meu filho amado, teu abraço é casa onde eu quero morar |  Que a vida te dê caminhos largos, que o vento leve só o que precisar |  Que eu continue sendo seu porto, e você continue a me ensinar |  Hoje sopre as velas e guarde bem: a nossa história é prova de amor fiel |  Hoje e sempre, feliz aniversário, meu menino, meu Yago Daniel.",
  },
  {
    id: "pix_char_d3HLLytJwZFU66uuY2c3P6JM",
    letra: "No sei se lembro o dia ou se o dia me escolheu, mas lembro do teu choro que virou riso e luz | Ana, menina de olhos azuis, encanto que chegou e fez casa no meu peito | Você me ensinou o amor sem condição, aquele que muda tudo e que me fez entender que ser sua mãe é o papel mais belo | Cresceu entre colo e risos, e a vovó Marilene foi segredo e cuidado, chamando você de joia rara com tanto orgulho | Lembro das noites em claro, dos primeiros passos, e do mundo inteiro cabendo no teu sorriso | Aos quatro, a família ganhou um novo som quando João Pedro chegou, e o lar ficou mais completo, mais riso, mais abrigo | Eu e o papai Glaysson olhando você crescer, com o coração inchado de orgulho por cada descoberta sua | Você é inteligente, leal, decidida, menina de luz própria que ilumina cantos que nem sabíamos que existiam | Hoje você completa quinze anos e parece poesia cada gesto seu, cada sonho que começa a andar | Não tenha medo de ser quem é, minha filha, guarde a essência, a doçura e esse coração gigantesco e sensível | Somos seu porto e sua plateia: estaremos aqui para segurar sua mão, para acolher seu pranto e aplaudir suas vitórias de pé | Lembre-se sempre do quanto é amada, do quanto sua existência nos transformou em gratidão viva a Deus | Que a fé que te habita continue sendo guia, que te proteja e te dê força nas encruzilhadas da vida | Quando o mundo pesar, venha, encoste em nós; encontraremos juntos jeito novo de sorrir e seguir | Cada conquista sua será festa nossa, cada queda, razão pra levantar você mais forte ainda | Ana, seu brilho não se mede, se sente; sua coragem ensina, sua ternura cura | Hoje sopre as velas com a certeza de que nunca estará sozinha, que nossos braços são abrigo eterno | O tempo vai te levar a lugares novos, mas nosso amor vai ser mapa, estrela e porto seguro | Obrigado por cada gesto, por cada sonho que eclode dentro de você e rega nossa vida com sentido | Nossa prece é gratidão a Deus por você, por essa menina que virou luz e caminho | Te amamos mais do que palavras escrevem, mais do que qualquer canção consegue levar | Te amamos infinitamente, hoje, sempre, além do infinito — Ana, filha da nossa vida, nosso amor sem fim",
  },
  {
    id: "pix_char_0mtxaM03dqRGJaS4uBGb5Cwa",
    letra: "Veio pequeno como promessa, Lyu, e iluminou meu chão |  Nos braços de mãe e silêncio, teu choro foi minha consolação |  Quando teu tio partiu aos vinte e dois, tu tinhas nove meses só |  E carregaste nas costas, sem saber, o peso e o alento do pó |  Tu foste minha sustentação, meu norte, meu lugar seguro |  Um neto mandado por Deus, de esperança vestido e muro |  Hoje completas vinte anos, e eu conto cada passo teu |  Como quem planta um jardim e colhe luz onde havia só adeus |  Refrão: Lyu, meu neto do sorriso claro, meu presente e oração |  Lyu, celebro contigo a vida que brotou da nossa mão |  Que cada vela acesa te lembre que és força e compaixão |  Que Deus guie teus passos leves, e aqueça sempre teu coração |  Cresceu nas noites em que chorei, e sorriu nas manhãs vindouras |  Aprendeste a ser abrigo, lente que transforma as amarguras |  Tua voz é o assobio do vento que diz: estamos aqui |  Teu abraço é ponte e remédio, teu caminho é para eu seguir",
  },
  {
    id: "pix_char_N2tpuMEx61jjpkwAkFxyuy0Q",
    letra: "Lais, meu coração te chama desde o primeiro suspiro que ouvi |  Chegaste cedo, seis meses e meio, tão pequena que cabia na minha mão |  Dois quilos e dez gramas de coragem, pele de flor e olhar de verão |  Naquele berço de luz eu jurei que lutaria com cada batida do meu peito por você |  Eu te amei antes mesmo de entender o tamanho do milagre que era você |  Lais, teu nome dança nas minhas noites, é oração e canção |  Quando nasceu a Letícia, dois meses depois, você lutava por cada respiração |  Vi o medo pintar a estrada em preto e branco, vi meus dedos buscando fé |  Achei que perderia você, que o mundo não guardaria sua pequena grande vida |  Mas você era feita de mola: voltou a pular, a sorrir, a encher o ar de alegria",
  },
  {
    id: "pix_char_DrW6TzTEUefDfy0LX4WcZxaK",
    letra: "Hoje eu canto para você sob as luzes do seu dia, Caroline Thais |  Lembro do primeiro pedido tímido: você aceitou e mudou a minha vida |  Vejo no seu sorriso a casa que eu sempre quis ter |  E no seu abraço a promessa de cada amanhecer |  Você é esposa maravilhosa, presença que aquece a nossa estrada |  E amiga amável do meu filho, com carinho que enfeita a jornada |  No compasso do seu riso eu encontro paz e coragem |  E no toque das suas mãos renasce um novo miragem |  Caroline Thais, meu amor, celebro seu viver hoje e sempre |  Cada gesto seu é luz que transforma o comum em presente |  No bolo acende a vela e eu peço ao tempo que seja lento |  Para guardar cada instante seu no livro do nosso tempo |  Quando você chegou e aceitou me conhecer, nasceu um lar |  Onde a ternura rege e o respeito sabe amar |  Seus olhos contam histórias que eu quero ouvir todas as noites |  Seus passos desenham um futuro feito de pequenos feitos e grandes vontades |  Parabéns, minha vida, que o riso nunca falte no seu caminho |  Caroline Thais, meu amor, meu abraço, meu destino, meu carinho",
  },
  {
    id: "pix_char_jKY0XhWauTq4CW2reRyqQ2wR",
    letra: "O dia mais especial foi quando te conheci, Cristina |  Eu estava em serviço e o mundo mudou de esquina |  Começamos devagar, um namoro que virou destino |  Casamos com a bênção de Deus, com o futuro no mesmo hino |  Você já trazia no peito um presente: Adana Kelita, luz que eu adotei |  E a partir desse abraço a nossa casa inteira eu amei |  Logo no começo Deus nos deu o Gustavo, riso que nos completou |  Quatro anos depois nasceu nossa princesa Chada Emilly, o amor brotou |  Mais quatro depois chegou o Guilherme, outro sonho em festa |  Cada filho, cada sorriso, cada manhã, presente que nos resta |  Cristina, teu nome é convite, teu olhar é meu lugar certo |  Agradeço a Deus por essa família que fez do caos um teto aberto |  Amo todos vocês com a força de quem aprendeu a cuidar |  Amo você, meu amor, na alegria e no respirar |  Se Deus quiser vamos envelhecer juntos, de mãos dadas até o fim |  Ver nossas histórias gravadas na pele, cada ruga um jardim |  Quero ser teu abrigo nas noites, teu parceiro em cada caminho |  Prometo regar nosso amor, celebrar triunfo e aprendizado com carinho |  Quando penso no que Deus nos deu, o peito enche de gratidão |  Adana Kelita, Gustavo, Chada Emilly, Guilherme — nossa canção |  Hoje declaro meu amor com nome, com verdade, com fé |  Cristina, aceita meu ontem, meu hoje e o sempre que prometi — eu te amarei",
  },
  {
    id: "pix_char_p5z0556fHbyb6BKZyKfqyd6A",
    letra: "Hoje o relógio acena e o dia sorri só pra você, Ana |  As velas tremem com medo de não alcançar tanta luz que há em você |  Te chamo de guerreira porque vi suas batalhas virar rumo e canção |  Cada cicatriz virou mapa de quem escolheu seguir e não se curvar |  Meu amor, celebro seu passo, sua coragem que me segura e me ensina |  Que venham os abraços que ainda não nos cabem e os sonhos que ficam maiores |  Desejo chuva de coisas boas, um tempo cheio de sol e vento a favor |  Que a vida te traga sorrisos fáceis, portas abertas e dias de paz |  Hoje é festa por tudo que você é — força, ternura, mar e ouro em pele |  Lembro do seu riso cortando a noite como luz que atravessa o medo |  E prometo: estarei ao seu lado, segurando a mão que faz o mundo inteiro |  Ana, amor, nome que ecoa em casa e na rua, no meu peito e nos seus passos |  Vamos brindar as pequenas vitórias, os cafés, as músicas que mudam tudo |  Que cada novo ano pinte mais cor no seu quadro, mais leveza no seu andar |  Você merece paz sem medida, alegrias que duram e flores de verdade |  Parabéns, minha guerreira, meu amor — que a vida te devolva o melhor de si |  Hoje, amanhã e sempre: eu celebro você, Ana, e o que ainda vamos ser",
  },
  {
    id: "pix_char_pxgpST5CZWCb0c6dJpjtrnqy",
    letra: "Lembro do primeiro olhar, da coragem que fez a minha mão tremer |  No dia seguinte você voltou atrás, e eu aprendi a respirar outra vez |  Conheci outro caminho, fui me reconstruindo entre dúvidas e cafés |  Mas o destino voltou em três meses batendo na minha porta, pedindo por nós |  Você chegou arrependido, com a voz baixa, pedindo uma chance pra ser diferente |  E eu, coração dividido, quis ouvir o que sobrava de verdade entre a gente |  Pedi para darmos um novo passo, para tentarmos sem pressa, sem medo |  Queria envelhecer ao seu lado, contar rugas como quem conta histórias ao vento |  Larguei o que me segurava e voltei pro seu abraço, onde aprendi a me reconhecer |  Em noventa dias já dividíamos colchão, pratos, sonhos e o mesmo café",
  },
  {
    id: "pix_char_5AnPqpNeb0ur3SP1ewdbRTEE",
    letra: "Vanessa, nascida em 16/06/1986, luz que nasceu pra cuidar |  A única menina entre três irmãos, flor que aprendeu a brilhar |  Você sempre morou comigo, companheira de cada manhã |  Motorista do destino, amiga que segura minha mão |  Tem uma filha de dez anos, riso que ilumina a casa |  Duas gerações de amor, duas vozes que a vida abraça |  Vanessa, teu cuidado é abrigo, teu jeito é terena canção |  Paixão do seu pai, lindembergue, coração que sente a razão |  Sempre preocupada com a família, querendo ver todo mundo bem |  Se houver vento de aflição, você acende um farol também |  Adora os animais, adotaria o mundo inteiro sem pensar |  Os de rua, os abandonados, tua ternura quer cuidar |  Sonha em morar em Amsterdam, céu de bicicletas e luz |  E um dia casar na praia, com as ondas aplaudindo a sua cruz",
  },
  {
    id: "pix_char_rxHeeKA3axMYpXJQADDtUbj6",
    letra: "Alessandra, quando eu te vi pela primeira vez eu jurei que era breve |  A gente foi ficando, sem manual, sem plano, no compasso do acaso |  Você dizia que não queria nada sério e eu ria, escondendo o desejo |  Mas olha aonde a gente chegou hoje, o meu peito já mora no teu abraço |  Meu amor, eu vim te buscar nas pequenas horas de medo e silêncio |  E encontrei nos teus olhos um mapa onde eu quero me perder inteiro |  Teu riso virou abrigo, teu toque, tradução dos meus versos mais simples |  Cada dia contigo desmonta o meu costume de viver num mundo inteiro |  Eu não me vejo sem você, repetição que virou verdade e destino |  Quando penso no futuro, ele começa e termina com o teu nome grudado",
  },
  {
    id: "pix_char_LduMrzrZUTuBXkuC1EmkRHqH",
    letra: "Isadora, meu nome favorito, gravado no peito como um verso |  Você chegou como presente de Deus e trouxe calma pro meu universo |  Tem cinco anos, têm risos que fazem a casa inteira dançar |  Pequena grande alegria, meu pedaço de céu a brilhar |  Quando você dorme eu conto estrelas pensando no teu lugar |  Seguro tua mão e prometo não deixar você tropeçar |  O mundo cabe no teu olhar, tão vasto e tão singelo |  Cada palavra tua é canção, cada abraço é meu castelo",
  },
  {
    id: "pix_char_r5UCSU2qKgxsx6LKstUfapJy",
    letra: "Lembro do corredor branco, das lâmpadas vendo meu pulso bater mais forte |  Abri a porta e encontrei o teu rosto cansado, e o pequeno Miguel dormindo no teu colo |  Foi 27/09/2014, e o mundo inteiro pareceu caber naquela sala |  Naquele instante soube que tudo que eu esperava tinha nome — Letícia, meu amor |  Teu cabelo solto sobre o travesseiro, teu sorriso escondido entre o sono e a coragem |  A luz sobre vocês dois fez uma promessa silenciosa que eu jurei guardar |  Segurei as tuas mãos, senti o calor da nossa vida começando a respirar |  E a melhor coisa que aconteceu comigo foi ver você com nosso filho aos teus cuidados",
  },
  {
    id: "pix_char_ww3KrZhshxSK55NRppGzCxTH",
    letra: "No caixa do mercado eu sorria entre notas e sacolas | Você apareceu com uma caixinha dourada de bombons e o mundo parou | Tremia a voz quando perguntou se teria uma chance comigo | E eu disse sim com a canção do meu coração batendo alto | Gilberto, naquele instante nasceu o nosso primeiro nós | O til do leitor, o brilho na embalagem, o começo de uma história | Passaram as horas, viraram dias, e cada dia te escolhi de novo | Meu amor, você fez do ordinário um lugar sagrado",
  },
  {
    id: "pix_char_J2BakrPjKCqsBcdGGKnCpXsp",
    letra: "Stheffane, lembro do primeiro sorriso que cruzou nossa estrada | De primos a amantes, construímos sonhos na mesma jornada | Erguemos nossa casa no terreno dos meus sogros, tijolo por esperança | Cada parede guarda promessas, cada porta se abre pra confiança | Casamos sob o olhar de quem nos viu crescer, e o céu abençoou | Nossos votos se tornaram lar, e em cada manhã o amor floresceu | Eloah corre pelos quartos com riso de anjo, Henry segura minha mão | E eu encontro em vocês o reflexo do que é viver em comunhão",
  },
  {
    id: "pix_char_aKrZdAYkQK2tb5dXdcNK2NKh",
    letra: "Na sala onde as luzes dançavam, você brilhava mais que a festa |  O vestido rodopiava e o tempo parou quando a orquestra respirou |  Levei sua mão e o mundo ficou pequeno, só existia o som da valsa |  No compasso lento eu juntei coragem, ajoelhei, e a verdade entrou |  Maria Eduarda, meu coração falou alto no silêncio do salão |  Entreguei uma aliança que guardava promessas, tremendo de emoção |  As velas do seu bolo refletiram nos olhos que eu já chamava de lar |  E a noite fez de testemunha o que eu sempre quis perguntar",
  },
  {
    id: "pix_char_M5CwqHstXYPXRrXyAEKu5M1P",
    letra: "Na escola eu colhia coragem no canto do recreio |  A amizade foi semente e virou manhã inteira |  Você, meu primeiro namorado, com as mãos tremendo e um sorriso aberto |  Lembro da maçã do amor que a gente dividiu no parque |  Ali, no açúcar e no frio da tarde, eu já sabia que era você |  Leandro, meu amor, eu te escolheria mil vezes |  Leandro, meu abrigo e meu riso, meu porto e meu lugar |  Se eu tivesse que reescrever a vida, começava por você de novo",
  },
  {
    id: "pix_char_RQMX1peqxjZyHfcNuXsdSXx5",
    letra: "Quando a manhã acorda e a lembrança pesa, eu seguro tua mão, Venilton |  Teu riso enche a casa, teu abraço ensina a ser abrigo |  Pai presente nas pequenas coisas, amigo fiel nas estradas da vida |  Guerreiro que não se curva, batalhador que transforma dor em caminho |  Venilton, teu nome é fogo que aquece a nossa coragem |  Venilton, teu passo firme é farol nas noites mais longas |  Não estás só, somos muitos cores entrelaçados no teu peito |  Cada olhar, cada palavra, cada silêncio vira promessa de cuidado",
  },
  {
    id: "pix_char_QSbkhMK4f2mg5ugw2x3EhUHZ",
    letra: "Quando você nasceu, Yasmin, entrou o rosa e acendeu a sala inteira |  Trouxe mais cor, trouxe leveza, fez do meu mundo um lugar de surpresa |  Lembro de desembaraçar seus cabelos, dedilhar cada nó como um rito |  Suas mãos pequenas se aninhavam nos meus dedos, eu era abrigo e infinito |  Você dizia que me ama mil milhões e eu guardava essa frase como um tesouro |  E quando era pequena, eu amava quando falava \"tironte\", sua voz era puro ouro",
  },
  {
    id: "pix_char_FKubUnGDTrbSHgxzw0rGa6jR",
    letra: "Roque, meu coração, eu te chamo como se chamasse a casa onde sempre quis morar | Em 1997 a gente se tocou, duas mãos que prometeram caminhos | Eu era menina de 17 anos quando a vida me empurrou para longe, para Santa Catarina, a 640 km do teu abraço | Levei no peito a escolha que fiz, fiz uma família, vivi vinte e dois, vinte e três anos com uma história nova e um amor secreto guardado | Mas o teu nome ficou guardado na dobra do tempo, como um retrato que não se descasca | Voltei depois de vinte e oito anos e o medo veio junto, a pergunta: será que ainda existe aquilo entre nós?",
  },
  {
    id: "pix_char_ZgkjcBGw1EZPAaEbFULy3RyC",
    letra: "Quando você ri, o mundo aprende a respirar | Viviane Andrade, seu nome acende as coisas mais simples em mim | Seu jeito fofo e tímido chega suave, como quem fica e insiste em ficar | Eu observo cada gesto e descubro versos onde antes só havia caminho | As suas brincadeiras são luz que quebra o cotidiano e me chama pra brincar também | No seu sorriso mora um segredo que me convida a ser inteiro e a confiar",
  },
  {
    id: "pix_char_pD3PwZbtRMkYxjhwwTYxEGM2",
    letra: "Eloah Victoria, meu raio de sol que nasceu de luta e de fé |  Veio de uma gestação difícil, mas trouxe esperança inteira |  Com apenas vinte e quatro horas de vida, um susto dentro da maternidade |  Caiu no chão, tremi o mundo inteiro, segurei seu choro como quem reza |  Veio um pequeno coágulo, e o coração da mãe parou por um segundo |  Aos três descobrimos a catarata congênita, e o medo virou pressa |  Corremos pra operar, de mãos dadas com a coragem, sem perder o amor |  Hoje você faz tratamento, olhos que aprendem a ver o mundo aos poucos",
  },
  {
    id: "pix_char_35g4WjDTwANdJ3bMgWy4pYhf",
    letra: "No dia em que você chegou, Harryson, meu peito encontrou seu lar | Primeiro choro, primeiro cheiro de casa, foi você, meu filho, quem me ensinou a cuidar | Mãozinha que apertou meu dedo como se fosse segredo do mundo | Noites viradas, canções no silêncio — cada suspiro seu valeu cada segundo | Sou sua mãe, seu espelho e seu farol, você acendeu minha coragem | Hoje as velas tremem no bolo, mas o brilho vem dos seus passos na paisagem",
  },
  {
    id: "pix_char_wp04ZXcnm01bAxNfWDgjpaRd",
    letra: "Hoje o céu veio mais leve para o teu dia | Yasmim, menina que trouxe verão ao meu inverno | Dezesseis velas tremulam como promessas no bolo | Eu ainda lembro do teu primeiro choro, do meu primeiro abraço | Minhas mãos aprenderam seus passos antes dos teus pés | Cada riso teu virou mapa para os meus sonhos | Hoje você cresce e eu cresço com você, sem medida | Teu nome é brisa que chama em todas as janelas da casa",
  },
  {
    id: "pix_char_xrycytG5wTTQA1tHS0CCAk2y",
    letra: "Keila, acordei com teu nome desenhado no meu amanhecer, e Honda aos pés da cama |  Na cobertura, entre planilhas e conversas, eu procuro teu olhar, ansioso pelo \"miau\" dela à noite |  Recebo tua mensagem como se fosse sol no meio do expediente, assim como o ronronar de Honda |  Imagino teu riso no café, e ele me faz suportar qualquer reunião, ao pensar nela deitada na almofada",
  },
  {
    id: "pix_char_1TZJdd6qP3qCYQdGENArbLhS",
    letra: "No silêncio da casa o tempo vira ponte e eu não consigo atravessar |  A janela guarda seu nome em luz, e cada vento me lembra seu falar |  Amanda, meu amor, você é minha base, o chão que acalma meu andar |  Saudade é grande como mar aberto, e eu sou barco que quer te alcançar |  Fecho os olhos e vejo a rotina que ainda não fizemos começar |  Seu riso comanda as manhãs, suas mãos escrevem o mapa do meu lar",
  },
  {
    id: "pix_char_CPh0pauWbPUhyfbYnmH1MhD3",
    letra: "Luciano, você é o porto seguro onde ancorei meu medo |  Nos teus olhos aprendi a respirar o que eu havia perdido |  Foi você que juntou minhas peças, com cuidado e sem pressa |  Nos teus braços encontrei a casa onde minha alma se estabeleça |  Você curou minhas feridas com paciência e gestos simples |  Dessa cura nasceu a luz maior: nossa filha, Ana Lúcia, nosso riso",
  },
  {
    id: "pix_char_nzxtKg4dDQeJKQyNujPDzjyg",
    letra: "No som da chaleira, entre risos, o aroma abre caminho para você|  Mesa posta de lembranças, pão doce, queijo e o jeito de acolher|  No Cenáculo, vamos celebrar com amigos, seu dia especial e feliz|  Hoje o relógio sorri lento, conta os minutos com cuidado|  E eu chego com um desejo simples: que seu dia seja celebrado|  Glaucia, teu nome é canção que eu guardo no bolso da memória",
  },
  {
    id: "pix_char_XjSJCRBqUGnd2AyEccDHCPSJ",
    letra: "Hoje o sol chegou cedo pra te saudar, Lorena |  Nasceu em dois mil e dez e fez o mundo mais claro pra mim |  Desde então você é presença que aquece os dias frios |  Minha neta, meu encanto, meu riso dividido |  Você e teu pai, laço forte, caminhada de mãos dadas |  Ele é teu espelho, teu abraço, e eu vejo amor nas jogadas",
  },
  {
    id: "pix_char_ERnSGTXL0zmqSdf2G5aTbpwT",
    letra: "Hoje é teu dia e eu trago no peito a canção que nasceu pra você |  Lembro da casa da minha irmã, no aniversário dela em 2008, nosso primeiro olhar a florescer |  Entre risos e bolo, começamos a nos conhecer, devagar como quem aprende a andar |  Desde então são 17 anos de história, e 14 de promessas seladas no altar |  Valéria, teu nome é abrigo quando o mundo insiste em ventania |  Guerreira amorosa, mãos firmes, coração que acolhe e desafia",
  },
];

async function main() {
  console.log(`Atualizando letra de ${letras.length} registros...`);

  for (const r of letras) {
    await prisma.pedido.update({
      where: { id: r.id },
      data: { letra: r.letra },
    });
    console.log(`✓ ${r.id}`);
  }

  console.log(`\nConcluído!`);
}

main()
  .catch((e) => {
    console.error("Erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
