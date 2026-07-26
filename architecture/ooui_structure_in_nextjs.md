# OOUI構成 第2部 — Next.js実装編(App Router / React Server Components)

> 本文書は`ooui_structure_in_nuxt3.md`の**第1部 概念編(フレームワーク非依存)と対になる、Next.js版の第2部**である。
> 章番号はNuxt版第2部と揃えて4〜7章とし、「3-5.」等の参照はメモ第1部の節を指す。
> 前提: **Next.js App Router + React Server Components(RSC)ネイティブ**。データ取得はServer Component、変更(Write)はServer Actionsで行う。Pages Router・クライアント中心構成(Static Export)は対象外。

**最重要の要約**: 概念編の原則はNext.jsでも成立するが、Nuxt版のような1:1の写像ではなく「翻訳」が必要になる。鍵は2つ — (1) **表示系/入力系の分離(3-2)がRSCのserver/client境界とほぼ一致する**こと、(2) **Server Actionsが「関数をpropsでクライアントへ渡せる」唯一の経路**であり、これが遷移のページ一元化(3-6)をRSCの世界で成立させること。

---

## 4. ディレクトリ構成とルーティング対応

### 4-1. 概念マッピングとディレクトリ全体像

第1部2-1の一般対応は、Next.js(App Router)では次のように具体化される。

| OOUI概念 | Next.js実装 |
|---|---|
| オブジェクト(モデル) | ドメイン型(`types/`)＋リポジトリ層(`repositories/`、サーバー専用) |
| コレクションビュー(一覧) | `app/users/page.tsx`(＋一覧用Container = 非同期Server Component) |
| シングルビュー(詳細) | `app/users/[id]/page.tsx`(動的セグメント) |
| アクション(CRUD) | `create/page.tsx`＋フォーム(Client Component)＋**Server Action** |
| ルートナビゲーション | `app/layout.tsx`＋共通ナビゲーションコンポーネント |
| インタラクション層 | App Routerのルーティング＋RSC/Server Actions＋(クライアント側は)hooks |
| プレゼンテーション層 | components＋layout＋スタイル |

App Routerは`app/`配下のフォルダ構造がそのままルートになる(ディレクトリベースルーティング)。`app/users/page.tsx`→`/users`、`app/users/[id]/page.tsx`→`/users/:id`となり、**OOUIのコレクション/シングルがフォルダに対応する**(Nuxtの「ファイル対応」との違いは、ルート1つにつきフォルダ+`page.tsx`である点のみ)。

ディレクトリ例(オブジェクト＝user, product):
```
src/
├── app/                          # App Router: ルーティング境界のみ(極薄ページ)
│   ├── layout.tsx                # ルートナビゲーション
│   ├── page.tsx
│   ├── users/
│   │   ├── page.tsx              # コレクション(/users)
│   │   └── [id]/page.tsx         # シングル(/users/:id)
│   └── products/
│       ├── page.tsx
│       ├── [id]/page.tsx
│       └── create/page.tsx       # アクション(作成)
├── components/
│   ├── ui/                       # 汎用UI(ドメイン知識なし) ※原則は「3-1.」「3-2.」
│   │   ├── display/              # 表示系(props-only) → Server Componentにできる
│   │   │   ├── BaseBadge.tsx
│   │   │   └── BaseCard.tsx
│   │   └── input/                # 入力系(controlled) → 'use client'必須
│   │       ├── BaseInput.tsx
│   │       └── BaseSelect.tsx
│   └── user/                     # ドメインコンポーネント ※配置原則は「3-4.」
│       ├── UserListContainer.tsx     # 非同期Server Component(データ取得)
│       ├── UserList.tsx              # Presentational(Server)
│       ├── UserDetailContainer.tsx
│       ├── UserDetail.tsx
│       ├── UserForm.tsx              # 'use client'(入力系の島)
│       └── parts/
│           └── UserStatusBadge.tsx
├── actions/                      # Server Actions(ユースケース関数、'use server')
│   └── userActions.ts
├── hooks/                        # クライアント側ロジック(Nuxtのcomposables相当、縮小)
├── repositories/                 # API/DB呼び出しの隠蔽(server-only)
│   └── userRepository.ts
└── types/                        # ドメイン型(server/client共用)
```

Nuxt版との構造差分は3点: (1) `pages/`+`server/api/`の2層が`app/`(RSC)に統合される、(2) `composables/`は`hooks/`に対応するが**Read系ロジックがRSCへ移るため役割が縮小**する、(3) Write系のユースケース置き場として`actions/`(Server Actions)が新設される。

### 4-2. RESTとデータ層(Route Handlerは原則不要)

- コレクション: `GET /users`相当 ⇔ `app/users/page.tsx` ⇔ `userRepository.findAll()`(RSC内で直接呼ぶ)
- シングル: `GET /users/:id`相当 ⇔ `app/users/[id]/page.tsx` ⇔ `userRepository.find(id)`
- 作成: `POST /users`相当 ⇔ Server Action(`actions/userActions.ts`)⇔ `userRepository.create()`

RSCネイティブ構成では、**Read/WriteともHTTPエンドポイントを経由せず**、サーバー上でリポジトリを直接呼ぶ(NuxtのNitroがSSR時にHTTPを介さないのと同じ利点が、常時成立する形)。OOUI・REST・ルーティングの三位一体(2-1)は保たれるが、RESTは「外形のURL設計と操作の分類」として現れ、内部実装はRoute Handler(`app/api/**/route.ts`)を必要としない。Route Handlerは外部クライアント(モバイルアプリ等)に同じリソースを公開するときだけ追加する。

---

## 5. Next.jsのレイヤー設計

### 5-1. App Routerの規約ファイル(おさらい)
- `page.tsx` … ルートのUI(ビュー=OOUIのコレクション/シングル)。デフォルトでServer Component
- `layout.tsx` … 共通レイアウト(ルートナビゲーション等)。ネスト可
- `loading.tsx` / `error.tsx` … Suspense/エラー境界の規約ファイル
- `route.ts` … Route Handler(本構成では外部公開時のみ)
- `middleware.ts` … ルートガード(認証・認可)
- Server Actions … `'use server'`を宣言した非同期関数。フォーム送信・変更処理の標準経路

### 5-2. server/clientの境界設計
RSCの原則: **すべてはServer Componentから始まり、`'use client'`を宣言した境界からクライアント側になる**。境界を跨いでpropsに渡せるのはシリアライズ可能な値のみ(通常の関数は渡せない。**例外がServer Action**)。

本構成での境界方針:
- **表示系(display)・Presentational・Container**: Server Componentに保つ(イベントハンドラを持たないため可能)
- **入力系(input)・フォーム**: `'use client'`の島として最小範囲で切る
- `'use client'`はツリーの**できるだけ葉に近い位置**に置き、サーバー領域を最大化する

この方針が成立するのは、概念編3-2の表示系/入力系分離(書き込み経路の有無によるCQS分割)が、**RSCのserver/client境界の分割線と本質的に同じ**だからである(詳細は6-2)。

### 5-3. リポジトリ層(server-onlyの強制)
リポジトリの実装はサーバー専用とし、クライアントバンドルへの混入をビルド時に防ぐ。

```ts
// repositories/userRepository.ts
import "server-only"; // クライアントからimportされたらビルドエラーにする公式パッケージ

import type { User } from "@/types/user";

export interface UserRepository {
  findAll(): Promise<User[]>;
  find(id: string): Promise<User>;
}

// 本番実装(DB/外部APIを直接呼ぶ)
export const userRepository: UserRepository = {
  async findAll() { /* ... */ },
  async find(id) { /* ... */ },
};
```

- interface(抽象)と型は共用可能だが、実装は`server-only`でガードする。
- テストでは`UserRepository`を満たすInMemory実装を注入する(L・DIP)。ただしRSC(非同期コンポーネント)自体のテストはVueより制約が強いため、**テストの重心はリポジトリと純粋なドメインロジックに置き、Containerは「リポジトリ呼び出し+受け渡し」だけの薄さに保つ**のが現実的(概念編のSRPの帰結でもある)。

### 5-4. キャッシュと再検証(要点のみ)
RSCのデータ取得はNext.jsのキャッシュ機構(fetchキャッシュ、ルートキャッシュ)の上に乗る。変更(Server Action)後は`revalidatePath()` / `revalidateTag()`で該当ビューを再検証するのが基本形。キャッシュ挙動の既定値はNext.jsのバージョンで変化が大きい領域なので、**具体的な既定値・オプションは採用バージョンの公式ドキュメントで必ず確認する**こと(本文書ではアーキテクチャ上の位置づけのみ扱う)。

### 5-5. クライアント状態管理の位置づけ
Nuxt版のPinia限定使用に対応する原則: **サーバー状態(一覧・詳細データ)はRSCの世界に置き、クライアントに複製しない**。クライアント側の状態はフォーム入力・UI状態(モーダル開閉等)に限られ、`useState`/`useActionState`とカスタムフックで足りることが多い。アプリ横断のクライアント状態(テーマ等)が本当に必要な場合のみContext等を限定導入する。

---

## 6. 設計原則のNext.jsでの実現

### 6-1. 明示import(「3-7.」の実現)
Next.jsには自動import機構が存在しないため、**明示import原則は追加設定なしで満たされる**(Nuxt版6-1のような無効化設定は不要)。バレルファイル禁止はそのまま適用する(循環依存・tree-shaking阻害の一般論に加え、バレル経由のimportはserver/client境界の追跡も曖昧にする)。パスは`tsconfig.json`の`paths`(`@/*` → `./src/*`)で安定させる。

### 6-2. 表示系/入力系のReact規約(「3-2.」の実現)
- **表示系**: propsのみで描画し、イベントハンドラのpropsを持たない。**この定義を満たすコンポーネントはServer Componentにできる**。
- **入力系**: controlled component(`value` + `onChange`)に準拠する(Vueのv-modelに対応)。イベントハンドラを持つため**必然的に`'use client'`**。混合型(トグル等)は入力系として扱う(概念編と同じ)。

つまり概念編の判定基準「書き込み経路を持つか」は、Reactでは「`'use client'`が必要か」とほぼ同値になる。**表示系/入力系のディレクトリ分離が、そのままserver/client境界の見取り図として機能する** — これはこの分離をフレームワーク非依存の原則として立てたことの、想定していなかった配当である。

### 6-3. 極薄ページとContainer/Presentational(「3-5.」の実現)
ページの4責務は維持される。翻訳は次の通り。

1. **ルーティング境界**: `params` / `searchParams`の取り出し(近年のNext.jsではPromiseなので`await`する。記法はバージョン確認)
2. **ページメタ**: `metadata`エクスポート / `generateMetadata`
3. **Containerへの委譲**: Containerは**非同期Server Component**になり、リポジトリを直接`await`する
4. **画面遷移の実装**: 6-4参照

```tsx
// app/users/[id]/page.tsx — 極薄ページ(Server Component)
import { UserDetailContainer } from "@/components/user/UserDetailContainer";

export default async function UserDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetailContainer userId={id} />;
}
```

```tsx
// components/user/UserDetailContainer.tsx — 非同期Server Component
import { userRepository } from "@/repositories/userRepository";
import { UserDetail } from "@/components/user/UserDetail";

export async function UserDetailContainer({ userId }: { userId: string }) {
  const user = await userRepository.find(userId); // HTTPを介さず直接呼ぶ
  return <UserDetail user={user} />;
}
```

- **禁止事項は同じ**: ページにドメイン表示ロジックを書かない。データ取得はContainer(リポジトリ経由)のみ。
- **ウォーターフォール注意も同じ**: RSCでもネストした非同期コンポーネントは親のレンダリングを待ってからfetchを開始する。Containerはページ直下に置き、fetchのネストを深くしない(並列が必要なら`Promise.all`をContainer内で使う)。`loading.tsx`/`Suspense`でストリーミング境界を設けるのは任意。
- **AD対応(3-5)も保たれる**: ADのtemplates ≈ Presentational(`UserDetail.tsx`)。同一Presentationalを複数文脈から再利用できる点も同じ。

### 6-4. 遷移のページ一元化(「3-6.」の実現)
概念編の原則(遷移先URLの知識はページに一元化、Container/Presentationalはルーティング非依存)は、RSCでは**Server Actionの受け渡し**によって成立する。

**宣言的リンク(パスの注入)**: RSCには「関数はclient境界を越えられない」という制約があるため、注入方法が2形態に分かれる。

- 渡す先が**Server Component**(表示系Presentational)なら、Nuxt版と同様にパス構築関数をpropsで渡してよい(サーバー内で完結するため制約なし)。
- 渡す先が**Client Component**なら、関数は渡せないので**構築済みのhref文字列**を渡す(ページ/Containerがパスを計算し、データに載せて下ろす)。

```tsx
// app/users/page.tsx — パス構築の知識はページが持つ
import { UserListContainer } from "@/components/user/UserListContainer";

export default function UsersPage() {
  const detailPath = (id: string) => `/users/${id}`;
  return <UserListContainer detailPath={detailPath} />;
}

// components/user/UserList.tsx — Server Componentなので関数propsを受け取れる
import Link from "next/link";
export function UserList({ users, detailPath }: {
  users: User[]; detailPath: (id: string) => string;
}) {
  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}><Link href={detailPath(u.id)}>{u.name}</Link></li>
      ))}
    </ul>
  );
}
```

**命令的遷移(保存後リダイレクト)**: Server Actionは「client境界を越えて渡せる唯一の関数」なので、**遷移知識を含むアクションのラッパーをページ(サーバー側)で定義し、フォーム(Client)にpropsで渡す**。

```tsx
// actions/productActions.ts — ユースケース。遷移知識を持たない
"use server";
import { productRepository } from "@/repositories/productRepository";

export async function createProduct(input: ProductInput): Promise<{ id: string }> {
  return productRepository.create(input);
}
```

```tsx
// app/products/create/page.tsx — 遷移の実行はページ(の定義したaction)が担う
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createProduct } from "@/actions/productActions";
import { ProductForm } from "@/components/product/ProductForm";

export default function ProductCreatePage() {
  async function createAndGo(input: ProductInput) {
    "use server";
    const { id } = await createProduct(input); // ユースケース呼び出し
    revalidatePath("/products");               // 一覧キャッシュの再検証
    redirect(`/products/${id}`);               // 遷移知識はページ側にだけ存在する
  }
  return <ProductForm action={createAndGo} />;
}
```

```tsx
// components/product/ProductForm.tsx — 'use client'。actionをpropsで受けるだけで
// ルーティングに依存しない(概念編3-6のemit報告に相当する形)
"use client";
export function ProductForm({ action }: { action: (input: ProductInput) => Promise<void> }) {
  /* controlled inputs + form action={...} */
}
```

- **不採用とした方式**(概念編3-6と対応): 「Server Action内(actions/)に`redirect`を書く方式」は配線が減るが、ユースケースに遷移先がハードコードされ再利用(モーダルからの作成等)を阻害するため不採用。「Client側で`useRouter().push`する方式」も、ルーティング知識がフォーム側に漏れるため不採用。

### 6-5. hooks/クライアントロジック(「2-3.」SRPの実現)
Nuxtのcomposablesに対応するのはカスタムフック(`hooks/`)だが、**Read系ロジックがRSCへ移ったため役割は縮小**し、主にフォーム状態・楽観更新・UI状態が対象になる。「1 hook = 1責務」の原則は同じ。Server Actionの進行状態は`useActionState` / `useTransition`(React標準)で扱い、独自のフェッチ層(SWR等)はこの構成では導入しない。

---

## 7. Nuxt版との対応表と、翻訳で変質した点

### 7-1. 対応表

| 概念編の原則 | Nuxt 3実装 | Next.js(App Router/RSC)実装 |
|---|---|---|
| コレクション/シングル(2-1) | `pages/users/index.vue` / `[id].vue` | `app/users/page.tsx` / `[id]/page.tsx` |
| BFF/データ層(2-1) | `server/api/`(Nitro)+ `$fetch` | RSC/Server Actionsからリポジトリ直呼び(Route Handler不要) |
| 極薄ページ(3-5) | `definePageMeta` + Container委譲 | `await params` + `metadata` + Container委譲 |
| Container(3-5) | ページ直下・`useAsyncData`で取得 | **非同期Server Component**・リポジトリを直接await |
| Presentational(3-5) | props-only(emit禁止) | props-only(ハンドラprops禁止)= Server Component可 |
| 表示系/入力系(3-2) | `display/`(emit禁止)/`input/`(v-model) | `display/`(Server可)/`input/`(controlled + `'use client'`) |
| 命令的遷移(3-6) | Containerがemit → ページが`navigateTo` | ページ定義のServer Actionが`redirect` → フォームはaction propsを受けるだけ |
| 宣言的リンク(3-6) | パス構築関数をprops注入 + `NuxtLink` | Server間は関数注入可 / Client境界はhref文字列を注入 + `Link` |
| 明示import(3-7) | `imports.dirs: []`等の設定で実現 | 設定不要(自動importが存在しない) |
| ロジック分離(2-3) | composables(Read/Write両方) | Read=RSC、Write=Server Actions、クライアント状態のみhooks |
| 状態管理限定(Nuxt版5-5) | Piniaは横断状態のみ | サーバー状態をクライアントに複製しない。Contextは最小限 |

### 7-2. 翻訳で変質した点(移植時の再検討記録)
1. **Containerの実行場所が反転した**: Nuxtでは「クライアントでも動くコンポーネントがSSRもされる」だったが、RSCではContainerはサーバー専用になる。「モーダル等からのContainer再利用」(3-5の採用理由)は、RSCでは「別ページ/別スロットからの再利用」に読み替える。クライアント内での動的な再利用が必要な場面では、Read系も含めてClient化する局所判断が要る(その場合の設計は本書の対象外)。
2. **関数propsのシリアライズ制約**: 宣言的リンクの「パス構築関数の注入」はclient境界で文字列注入に形を変えた。原則(ルーティング知識の一元化)は不変だが、機構は変わる。
3. **Server Actionsという新しい層**: Nuxtに存在しなかった「ユースケース関数(actions/)」が層として現れた。遷移を含むラッパーをページに、遷移を含まないユースケースをactions/に、という分担が3-6の翻訳形。
4. **テスト重心の移動**: 非同期Server Componentの単体テストは制約が強いため、テストはリポジトリ・純粋ドメインロジック・入力系Client Componentに寄せる。Containerを薄く保つ規約(3-5)がここで効く。

---

## Caveats(Next.js版固有)
- **バージョン依存の記法に注意**。`params`のPromise化、キャッシュの既定値、Server Actions関連APIはNext.jsのメジャー/マイナーで変化が大きい。本書はアーキテクチャ上の対応づけを主とし、**具体的な記法は採用バージョンの公式ドキュメントで確認する**こと(コード例は概念を示すための骨子)。
- **RSCのDI**は、Vueにおけるprovide/injectやプラグイン注入ほど素直な機構がない。本書はモジュール参照(server-only実装の直接import)+ テストでのInMemory差し替えという最小構成に留めた。DIコンテナ的な仕組みの導入は規模が要求してから。
- **実践事例の調査は未実施**。Nuxt版7章(事例)に相当する内容は、必要になった時点で別途リサーチする。
- Static Export(SPA)構成を採る場合、本書の前提(RSCでのデータ取得・Server Actions)は成立しないため、別の翻訳(Client Container + フェッチ層)が必要になる。その場合はNuxt版第2部の構造の方が近い。
