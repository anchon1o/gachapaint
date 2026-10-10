# Gachapaint

Máquina de gachapón onde os premios son debuxos da xente. Cada día debuxas 3 obxectos, repártelles ¥1000 en pasos de ¥10 (¥5000 con 10 días de racha, ¥10000 con 30) e gañas 3 tiradas. Os autores poden amosar os seus debuxos na galería, onde se votan; cada luns os votos da semana suben ou baixan o seu valor. A máquina non arranca ata ter 100 obxectos dentro.

Idiomas: galego, castelán, catalán e éuscaro (botón da bandeiriña).

## Que hai en cada cartafol

```
index.html            a páxina
css/gachapaint.css    o deseño
js/config.js          ← aquí van os datos de Supabase (o único que tes que tocar)
js/i18n.js            os textos nos 4 idiomas
js/api.js             conexión cos datos (en liña ou modo proba)
js/app.js             o xogo
supabase/schema.sql   o que hai que executar en Supabase
```

## 0. Probalo sen instalar nada

Abre `index.html` co navegador (dobre clic). Se `js/config.js` está baleiro, o xogo funciona en **modo proba**: todo se garda só no teu navegador, hai xogadores de exemplo e en ⚙️ tes botóns para pasar de día e simular xente.

---

## 1. Preparar Supabase

Usamos o proxecto que xa tes (**xogos**). As táboas levan o prefixo `gch_`, así que non tocan as dos outros xogos.

1. Entra en [supabase.com](https://supabase.com) e abre o proxecto **xogos**.
2. No menú da esquerda, preme **SQL Editor**.
3. Preme **New query** (ou o botón **+**).
4. Abre o ficheiro `supabase/schema.sql` cun editor de texto (o Bloc de notas vale), selecciona todo (Ctrl+A), cópiao (Ctrl+C) e pégao no editor de Supabase (Ctrl+V).
5. Preme **Run** (abaixo á dereita).
6. Debe aparecer *Success. No rows returned*. Se sae un erro vermello, cópiao e pásamo.
7. Comproba: no menú da esquerda, **Table Editor**. Deben aparecer `gch_items`, `gch_players` e `gch_state`.
8. Comproba tamén: no menú da esquerda, **Storage**. Debe aparecer un cartafol (bucket) chamado `gachapaint`, marcado como **Public**. Aí irán os debuxos.

> **Onde se gardan os debuxos.** As imaxes non van na base de datos (que compartes con todos os xogos), senón en Storage, que ten o seu propio espazo. Na base de datos só queda o nome do ficheiro. Cada debuxo ocupa uns 5–25 KB e só se descarga cando alguén abre esa bola ou mira o seu inventario.

## 2. Copiar os datos de conexión

1. En Supabase, abaixo á esquerda, preme a roda dentada **Project Settings**.
2. Entra en **API** (nalgunhas versións chámase **Data API** e as chaves están en **API Keys**).
3. Copia o **Project URL** (algo como `https://abcdefgh.supabase.co`).
4. Copia a chave pública: a que pon **anon public** ou **publishable** (empeza por `eyJ…` ou por `sb_publishable_…`). **Nunca** copies a `service_role` nin a `secret`.
5. Abre `js/config.js` cun editor de texto e pega as dúas cousas entre as comiñas:

```js
window.GACHA_CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOi...',
};
```

6. Garda o ficheiro. Se agora abres `index.html`, xa xoga en liña (desaparece o aviso de modo proba).

> A chave pública pode estar á vista sen problema: as táboas están pechadas e só se pode xogar a través das funcións, que comproban todas as regras (a suma dos prezos, as 3 tiradas, o inventario…).

## 3. Subilo a GitHub

1. Entra en [github.com](https://github.com) e preme **+** (arriba á dereita) → **New repository**.
2. Nome: `gachapaint`. Déixao **Public** ou **Private**, como prefiras. Non marques nada máis.
3. Preme **Create repository**.
4. Na páxina que aparece, preme a ligazón **uploading an existing file**.
5. Descomprime o zip no teu ordenador e **arrastra o contido do cartafol** (index.html, README.md e os cartafoles css, js e supabase), non o zip.
6. Abaixo, preme **Commit changes**.

## 4. Publicalo en Vercel

1. Entra en [vercel.com](https://vercel.com) → **Add New…** → **Project**.
2. Na lista de repositorios de GitHub, preme **Import** ao lado de `gachapaint`.
3. En **Framework Preset** escolle **Other**. Non cambies nada máis (non hai que compilar).
4. Preme **Deploy**. Nun minuto tes a ligazón (por exemplo `gachapaint.vercel.app`).

## 5. Para actualizar

Cando che pase ficheiros novos: en GitHub, entra no repositorio → **Add file** → **Upload files** → arrastra só os ficheiros cambiados (co mesmo nome e no mesmo cartafol) → **Commit changes**. Vercel publica a nova versión só.

---

## Actualizar a base de datos (cando cambie `schema.sql`)

Se che paso un `schema.sql` novo, execútao enteiro outra vez igual que no paso 1 (SQL Editor → New query → pegar → Run). Está preparado para executarse varias veces: engade o que falte e **non borra** xogadores, debuxos nin inventarios.

## Sons

Mete os ficheiros MP3 no cartafol `sounds`, cos nomes exactos que aparecen en `sounds/LEME.txt`. Se falta algún, o xogo usa un pitido no seu lugar. Cada persoa pode apagar efectos e música en ⚙️.

## Moderación

Cando un debuxo recibe 3 denuncias de persoas distintas, desaparece da máquina e queda oculto. Para revisalos:

Ver os debuxos ocultos:
```sql
select id, name, author_name, img from gch_items where hidden;
```

Se está ben, devolvelo á máquina:
```sql
update gch_items set hidden = false, in_pool = true where id = 'pega-aquí-o-id';
delete from gch_reports where item_id = 'pega-aquí-o-id';
```

Se está mal, borralo (e despois borra a imaxe en Storage, como se explica máis abaixo):
```sql
delete from gch_items where id = 'pega-aquí-o-id';
```

## Axustes útiles en Supabase (SQL Editor)

Cambiar cantos obxectos fan falta para arrancar:
```sql
update gch_state set goal = 100 where id = 1;
```

Arrancar a máquina xa, sen esperar:
```sql
update gch_state set started = true where id = 1;
```

Borrar un debuxo inadecuado (busca o seu nome en Table Editor → gch_items):
```sql
delete from gch_items where name = 'nome do obxecto';
```
Despois, se queres liberar tamén o espazo da imaxe: **Storage** → `gachapaint` → `items` → busca o ficheiro co nome que aparecía na columna `img` → **Delete**.

Empezar de cero (borra todo o de Gachapaint, nada dos outros xogos):
```sql
truncate gch_items, gch_players; update gch_state set started = false where id = 1;
```

## Pendente para máis adiante

- Moderación: botón de denunciar debuxos.
- Ver o espazo usado: **Project Settings → Usage** (o plan gratuíto trae 1 GB para Storage).

## Ranking para incrustar (ranking.html)

Página lixeira só co ranking, para mostrala nun iframe (por exemplo en cagando.vercel.app).

Parámetros da URL:
- `lang` = gl (por defecto), es, ca ou eu
- `n` = número de posicións (por defecto 10, máximo 100)
- `v` = ranking inicial: `ricos` (inventarios máis caros, por defecto), `pobres` (máis baratos) ou `obras` (debuxos máis votados da galería)
- `p` = período para `obras`: `semana` (por defecto; semana de luns a domingo en hora de España) ou `sempre`

Exemplo: `ranking.html?lang=es&n=5&v=obras&p=semana`

O ficheiro `vercel.json` deixa que esta páxina se mostre dentro de cagando.vercel.app (e cagar.vercel.app).
