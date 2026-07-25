# Nuxt 3プロジェクトにおけるOOUI構成 — 分割統治とSOLIDを軸にした学習・整理メモ

本メモは、フレームワークに依存しない設計の考え方をまとめた**第1部 概念編**と、それをNuxt 3でどう実現するかをまとめた**第2部 Nuxt 3実装編**の二部構成とする。将来Nuxt 4やNext.js向けの構成を検討する際は、第1部を共通の土台とし、第2部を対象フレームワーク向けに差し替える。

## TL;DR
- **OOUIの「オブジェクト → コレクションビュー(一覧) → シングルビュー(詳細)」という構造は、ルーティング(`/users`＝一覧、`/users/:id`＝詳細)にほぼ機械的に写像でき、これが分割統治の自然な単位になる。** 設計プロセス（オブジェクト抽出→ビュー/ナビゲーション→レイアウト）をそのままディレクトリ設計に持ち込むのが基本方針。Nuxtではファイルベースルーティングがこの写像を直接支える。
- **推奨は「標準構成＋ドメイン(feature/オブジェクト)別分割」を基本とし、規模が大きくなったらNuxt Layersでオブジェクト単位にモジュールを切る**という段階的アプローチ。ロジックはcomposables＋リポジトリ層に分離し、Piniaは横断的なグローバル状態に限定する。
- **SOLID(特に単一責任SRPと依存性逆転DIP)は、composableを1責務に保ち、コンポーネントを Presentational/Container に分け、API呼び出しをリポジトリ抽象の背後に隠すことで実装できる。** ただしAtomic Designの機械的な適用やLayers/クリーンアーキテクチャの過剰導入はアンチパターンになりやすい。
- **【決定事項】コンポーネントは「汎用UI/ドメイン」の2分類とし、汎用UIはさらに「表示系(display)/入力系(input)」でディレクトリ分離する。バレルファイルは使わず、自作コードは明示importとする。pagesは極薄のルーティング境界とし、全ページでContainerへ委譲する。画面遷移の知識(遷移先URL)はページに一元化する**(原則は第1部3章、Nuxt 3での実現は第2部6章)。

---

## Key Findings

1. **OOUIはUIの「情報構造」を決める設計理論であり、実装アーキテクチャと同型**。上野学氏／ソシオメディアの『オブジェクト指向UIデザイン』が体系化した「オブジェクト(名詞)を先に、タスク(動詞)を後に」という原則は、そのままドメインモデル→リソース→画面という実装の分割線になる。OOUIの3レイヤー(モデル／インタラクション／プレゼンテーション)は、Nuxtの「型・リポジトリ」「pages・ルーティング・composables」「components・レイアウト」に対応づけられる。

2. **コレクション/シングルの二分法がルーティングと完全に噛み合う**。`/users`(コレクション)と`/users/:id`(シングル)はRESTfulなリソース設計とも一致し、OOUI・REST・ルーティングが三位一体で自然に整合する。

3. **分割統治には「レイヤー別」と「ドメイン(feature)別」の2軸があり、両者を組み合わせるのが実践的**。小規模はNuxt標準構成、成長したらfeatures/ディレクトリ、大規模・複数アプリはNuxt Layers/monorepoという段階論が有力。

4. **SOLIDはVue/Nuxtでも成立するが、道具が異なる**。SRPはcomposableの責務分離、DIPはprovide/injectやプラグインによるリポジトリ注入で実現する。ただし現場記事には「もう推奨しない」と撤回された手法や、SSRで二重リクエストを生む古い実装も混在しており、鮮度の見極めが必要。

5. **最大の注意点：OOUI概念とNuxt実装を一体で解説した決定版の記事は存在しない**。本メモの対応づけは、OOUIデザイン側の定義とNuxtの実装知見を合成したもの。過度に「正解の構成」を求めず、プロジェクトに合わせて調整する前提が重要。

---

# 第1部 概念編(フレームワーク非依存)

## 1. OOUIの基本概念

### 1-1. オブジェクト指向UIとは
OOUI(Object-Oriented User Interface)は、**オブジェクト(もの・名詞)を起点にUIを設計する**考え方。タスク(やること・動詞)を起点とするタスク指向UIと対比される。上野学氏監修・ソシオメディア著『オブジェクト指向UIデザイン──使いやすいソフトウェアの原理』(技術評論社, 2020)が日本語圏での標準的な体系書で、同書「はじめに」は「世の中の業務アプリケーションの8割ぐらいはタスク指向のUI構成になっている」とし、「タスク指向からオブジェクト指向への転回」を「もう銀の弾丸と言っていいほど汎用的で強力なUI改善方法」と明言している。

歴史的には、OOUIという語はXerox PARCからAppleに移ったラリー・テスラーが1983年の講演論文で用いたとされる（Larry Tesler, "Object Oriented User Interfaces and Object Oriented Languages", ACM Conference on Personal and Small Computers, 1983年12月7–9日, San Diego, pp.3–5）。またIBMは1989年の『Object-Oriented Interface Design: IBM Common User Access Guidelines』でGUIの本質をオブジェクト指向性として説いた。上野学氏は、同書が「その前段部分で『Object-Oriented User Interface（OOUI）』という言葉でGUIの思想を語り」「GUIはオブジェクト指向であるべきであるということを具体的な実装サンプルとともに説いている」と記述する。つまり「GUIとはそもそもOOUIのこと」であり、アラン・ケイの「オブジェクトが先、やりたいことがその次」という思想、Mac初期ガイドラインの「名詞→動詞」の順序に通じる。

### 1-2. OOUIの4原則
『オブジェクト指向UIデザイン』が挙げるOOUIの原則は次の4つ：
1. **オブジェクトを知覚でき直接的に働きかけられる** — 操作対象がアイコン・テキスト等の形で画面に現れ、直接選択・移動できる。
2. **オブジェクトは自身の性質と状態を体現する** — 選択中・ダウンロード中・ロック等の状態がリアルタイムに視覚反映される。
3. **オブジェクト選択→アクション選択の操作順序** — 「名詞→動詞」。まず対象を選び、次にその対象に対して可能なアクションを選ぶ。
4. **すべてのオブジェクトが互いに協調しながらUIを構成する** — 限定的なオブジェクトを複数タスクで使い回す。

この「名詞→動詞」がモードレス性(モードのない、ユーザーが自由な順序で操作できる状態)を生む。タスク指向UIは「動詞→名詞」でモーダルになりやすい。

### 1-3. タスク指向UIとの対比
- **タスク指向**：最初にアクション(「削除する」「編集する」)を選び、次に対象を選ぶ。できることの数だけ選択肢・画面が必要になり、画面遷移が複雑化し、仕様変更のたびに大規模な改修と条件分岐が増える。
- **オブジェクト指向**：対象(オブジェクト)を選んでからアクションを選ぶ。『オブジェクト指向UIデザイン』(技術評論社, 2020)「はじめに」は逐語で「UIの構成をタスク指向からオブジェクト指向にすると、通常、画面数は5〜20分の1に減ります。それにより…設計もシンプルになり、開発工数は低減され、保守性も高まります」と述べる。
- **使い分け**：ATM(「引き出し」「預入れ」等の目的が明確な短時間操作)のようにタスク指向が適する場面もある。「広義のOOUI(体験全体をオブジェクト指向で整理する思想)」の中に、部分的にタスク指向UIを組み込むのが現実的。

### 1-4. 設計プロセス(3ステップ)
『オブジェクト指向UIデザイン』は、ソフトウェアデザインを**モデル／インタラクション／プレゼンテーション**の3レイヤーに分解し、それぞれに対応する3ステップを提示する：

1. **オブジェクトの抽出(モデル)** — タスクや要求から「名詞」を抽出し、関係を整理し、汎化して粒度を揃え、オブジェクトを特定する。オブジェクト同士の関係からメインオブジェクトを見つけ、プロパティ(付随情報)とアクションを紐づける。
2. **ビューとナビゲーションの検討(インタラクション)** — 各オブジェクトに「コレクションビュー(一覧)」と「シングルビュー(詳細)」を機械的に用意し、不要なものは省略。ビュー間の呼び出し関係を検討し、重要なオブジェクトをルートナビゲーション(タブ/ハンバーガーメニュー等)に選定する。
3. **レイアウトパターンの適用(プレゼンテーション)** — ルートナビゲーションの配置、ビューの配置、コレクションの表示形式(リスト/グリッド/カレンダー等)、フィルタリング、CRUD各アクションのパターンを適用しワイヤーフレーム化する。

重要なのは、この3ステップは**順不同で何度も行き来する**もので、「デザインにプロセスはない」とされる点。実務記事(スマートキャンプ、Gaji-Labo等)でも「モデル・インタラクション・プレゼンテーションを行ったり来たりして確認し合う」ことが強調されている。

## 2. OOUIから実装アーキテクチャへの写像

### 2-1. オブジェクトとビューの実装対応
OOUIの構成要素は、フレームワークを問わず次のように実装へ対応づけられる。

| OOUI概念 | 実装対応(一般) |
|---|---|
| オブジェクト(モデル) | ドメイン型＋リポジトリ層(API呼び出しの隠蔽) |
| コレクションビュー(一覧) | 一覧ルート(`/users`)とそのビューコンポーネント |
| シングルビュー(詳細) | 詳細ルート(`/users/:id`)とそのビューコンポーネント |
| アクション(CRUD) | 作成/編集フォームとユースケース処理 |
| ルートナビゲーション | 共通レイアウト＋ナビゲーションコンポーネント |
| インタラクション層 | ルーティング＋状態と振る舞いのロジック層 |
| プレゼンテーション層 | コンポーネント＋レイアウト＋スタイル |

OOUIのビュー分割はRESTfulリソース設計と同型でもある：
- コレクション：`GET /users` ⇔ 一覧ビュー
- シングル：`GET /users/:id` ⇔ 詳細ビュー

つまり**OOUI・REST・ルーティングが三位一体で整合する**。分割統治の観点では、OOUIの「オブジェクト」を分割の最小単位に据えると、モデル(型)・インタラクション(ルート/ロジック)・プレゼンテーション(コンポーネント)が同じオブジェクト境界で切り出され、各部分を独立に理解・変更・テストできる。

### 2-2. 分割統治の2軸(レイヤー別/ドメイン別)
Dave Stewart氏(davestewart.co.uk)は組織化の軸を「concern(関心＝レイヤー別)」と「domain(ドメイン＝feature別)」に整理する：
- **レイヤー別(concern)**：`components/`, `pages/`, `composables/`…で束ねる。starter templateの標準形で、小規模では見通しが良い。だが規模拡大に伴い「blogに関する全てが各フォルダに散らばる」ため、自然な関連が見えにくくなる。
- **ドメイン別(domain)**：`blog/`, `auth/`…配下に各機能のcomponents/pages/composablesを束ねる。「サイトが実際に何をするか」が見えやすく、一定規模を超えると直感的になる。

実践では、ドメイン別に束ねつつ全体共通はレイヤー別に置くハイブリッドが有力。**OOUIのオブジェクト＝分割単位**とすれば、featureをオブジェクト単位(user, product, order…)に切ることで、モデリングとディレクトリ構造が一致する。

### 2-3. SOLID原則との対応
- **S(単一責任)**：1コンポーネント/1ロジック関数=1責務。データ取得・整形・通知をそれぞれ別関数に。
- **O(開放閉鎖)**：propsやslot、関数の引数オプションで拡張し、既存を変更しない。
- **L(リスコフ置換)**：同一interfaceを満たすリポジトリ実装(本番/モック)を差し替え可能に。
- **I(インターフェース分離)**：巨大なストア/ロジック関数を機能別に分割。
- **D(依存性逆転)**：コンポーネント→リポジトリ抽象→具体実装、の向き。DIPにより本番/テストでリポジトリを差し替えでき、テスト容易性が上がる。具体的な注入手段はフレームワークごとに異なる(Nuxtでの手段は第2部5章)。

## 3. コンポーネント設計の原則(本プロジェクトの決定事項)

議論を経て確定した本プロジェクトの採用方針。いずれも「分類・依存関係をコード上で明示し、解析可能に保つ」という共通の価値観に基づく。フレームワーク固有の実現手段(設定・API)は第2部6章にまとめる。

### 3-1. 汎用UIとドメインコンポーネントの2分類
コンポーネントは次の2種類に分け、置き場所を分離する。

1. **汎用UIコンポーネント(ドメイン知識なし)** — `components/ui/`配下。`BaseButton.vue`, `BaseModal.vue`など。propsとslotだけで完結し、`User`や`Product`といったドメイン型を一切importしない。デザインシステムの部品に相当する。
2. **ドメインコンポーネント(オブジェクトに紐づく)** — `components/<object>/`配下。`UserList.vue`, `ProductCard.vue`など。OOUIのオブジェクトを表現する層で、内部では汎用UIコンポーネントを組み合わせて作る。

**依存の向きは常に「ドメイン → 汎用UI」の一方向**とし、逆流させない(DIP)。この一方向性自体が分割統治になっている。

**汎用UI(Base)の使用規約**：ドメインコンポーネント内でBase部品を**直接使ってよい**(`UserForm`内で`BaseInput`を直接使用OK)。propsを横流しするだけの**素通しラッパーは禁止**。ドメイン知識(値→表示のマッピング、制約、複数Baseの定型的組み合わせ)をカプセル化できるときだけドメイン小部品(例: ステータスenum→色のマッピングを持つ`UserStatusBadge`が`BaseBadge`をラップする)を作る。「必ずラップしてから使う」という機械的な規約は、素通しラッパーの量産を招き、Atomic Design機械的導入の失敗(「5-3.」のアンチパターン)と同じ轍を踏むため採らない。

なお、既存UIライブラリ(Nuxt UI, shadcn-vue等)に汎用UIを寄せる選択肢や、大規模時にNuxt Layer/monorepoパッケージとして汎用UIを切り出す選択肢もある(後者は「段階3」到達時に検討)。

### 3-2. 表示系(display)/入力系(input)のディレクトリ分離
汎用UIをさらに**表示系と入力系**に分け、ディレクトリで分離する。

```
components/ui/
├── display/            # 表示系: props-onlyの純粋な「データ → 描画」写像
│   ├── BaseBadge.vue   #   状態を持たず、変更イベントも発しない
│   ├── BaseCard.vue    #   テストはスナップショット/見た目検証で済む
│   └── BaseText.vue
└── input/              # 入力系: 双方向バインディングの標準I/Fに準拠
    ├── BaseInput.vue   #   書き込み経路を持ち、バリデーション・
    ├── BaseSelect.vue  #   フォーカス制御・IME対応等の固有の複雑さを抱える
    └── BaseDatePicker.vue
```

- **判定基準**：「読み取り専用か、書き込み経路(値の変更を親へ伝える経路)を持つか」。CQS(コマンド・クエリ分離)のUI部品への適用であり、ISP(インターフェース分離)にも適う。
- **混合型の扱い**：トグルスイッチやインライン編集テーブルなど表示と入力を兼ねる部品は**入力系として扱う**(書き込み経路を持つ時点で入力系の複雑さを持つため)。厳密な二分の強制はしない。
- **命名規約(併用)**：入力系は`Input` / `Select` / `Picker` / `Field` / `Form`等の語彙で終える。表示系は`Text` / `Badge` / `Card` / `List`等。ディレクトリと命名の両方で分類が読み取れる状態を保つ。
- **インターフェース規約**：表示系はprops-onlyで変更イベント禁止。入力系は双方向バインディングの標準インターフェースに準拠(Vueなら`v-model`、Reactならcontrolled component。Nuxt 3での具体規約は「6-2.」)。
- **OOUIとの整合**：コレクション/シングルビューは表示系中心、create/editアクションは入力系中心となり、CRUDのRead系/Write系が部品レベルでも分かれる。MUI等のデザインシステムも「Inputs」「Data Display」というカテゴリ分けを採用しており、実績のある分類軸。

※ 用語注意：MVCの慣例ではview=表示、controller=入力(操作の受付)。混乱を避けるため本メモでは「表示系(display)/入力系(input)」という中立的な語を使う。

### 3-3. 命名の原則(フルネーム方式)
`components/user/UserDetail.vue`のようにディレクトリ名との重複を受け入れ、**ファイル名単体で自己完結**させる。Nuxt公式ドキュメント自身がファイル名をコンポーネント名(パス連結後の名前)と一致させることを推奨しており、Vueスタイルガイドの「密結合したコンポーネント名(共通プレフィックス)」「コンポーネント名は複数語」のルールとも整合する。根拠は次の4点。

1. **OOUI第4原則(オブジェクト協調)によるドメイン横断利用**：`UserDetail`にそのユーザーの`OrderList`を埋め込む、`OrderDetail`に購入者の`UserCard`を埋め込む等が常態であり、「userコンポーネントはusersページ専用」という不変条件はOOUIを進めるほど自然に破れる。短名(各ドメインに`Detail.vue`)は横断利用の文脈で曖昧になる。
2. **grep可能性**：`UserDetail`で検索すれば定義と利用箇所が一発で揃う(明示import方針「3-7.」と同じ解析性の価値観)。
3. **デバッグ**：開発者ツールやエラースタックにはファイル名から推論されたコンポーネント名が出るため、一意な名前が診断を楽にする。
4. **タグ名の複数語ルール**：`Detail`単体はHTML要素(`<details>`等)と衝突しうる。

なお、現代のエディタ(VSCode)はファジーファインダーにパス併記・同名タブへのフォルダ名付加があるため、エディタ識別の問題は「致命的」ではなく「摩擦」程度。決め手は上記1〜4、特にOOUI特有の横断利用である。重複はDRY違反ではない(DRYは知識の重複の話で、名前の一部が一致することとは別問題)。

### 3-4. ドメインコンポーネントの配置(参照構造基準)
`components/<object>/`のルート直下には、ページ(またはContainer)から直接参照される**ビューレベル**のコンポーネント(Containerと対になるPresentational、`UserForm`等)のみを置く。ドメイン内の他コンポーネントからのみ参照される**内部部品**(`UserStatusBadge`, `UserListItem`等)は`components/<object>/parts/`に置く。

```
components/user/
├── UserDetailContainer.vue   # ビューレベル: 詳細ページから参照
├── UserDetail.vue
├── UserListContainer.vue     # ビューレベル: 一覧ページから参照
├── UserList.vue
├── UserForm.vue
└── parts/                    # 内部部品: このドメイン内からのみ参照
    ├── UserStatusBadge.vue
    ├── UserAvatar.vue
    └── UserListItem.vue
```

- **境界の基準は粒度ではなく参照構造**(誰から参照されるか)。「大きいか小さいか」による分類はAtomic Designのmolecules/organisms境界と同型の主観的議論を生むため採らず、客観的に判定できる(Lintによる機械的検証も可能な)基準にする。
- **サブディレクトリ名を`ui/`にしない理由**：トップレベルの`components/ui/`は「ドメイン知識を持たない汎用部品」を意味する名前として定義済み。ドメイン知識を持つことが存在理由である内部部品を`<object>/ui/`に置くと、同じ`ui`という名前が場所によって正反対の意味を持ち、名前から分類を読み取れるようにする一連の方針と逆行する。
- **採用理由**：運用・解析時の参照頻度はビューレベル(Container/Presentational)が圧倒的に高く、この配置ならIDEのファイルツリーで内部部品に埋もれず上部に固まる。また`components/<object>/`のルートがそのオブジェクトの持つビューの一覧(list/detail/form)をそのまま示し、ページ側のディレクトリ構造と鏡写しになるため、OOUIのビュー構造がツリーから読み取れる。
- **昇格の運用**：内部部品が後からページ/Containerに直接参照されるようになったら、`parts/`からルートへ移動する(頻度は低く、コストは許容範囲)。

### 3-5. ページの責務とContainer/Presentational(極薄ページで統一)
ページ(ルートに対応するコンポーネント)は**「URLとビューを結びつける結節点」に徹する極薄の層**とし、全ページで統一する。ページの責務は次の4つに限定する。

1. **ルーティング境界**: URLパラメータ/クエリの取り出し・検証・型変換
2. **ページメタの宣言**: レイアウト・ルートガード・head要素等の宣言
3. **Containerへの委譲**
4. **画面遷移の実装**: Containerからのイベントを受けた遷移の実行、およびリンク遷移先パスの注入(詳細は「3-6.」)

呼び出しの全体像(詳細ビューの例):

```
pages/users/[id].vue                           # ① ルーティング境界
  └→ components/user/UserDetailContainer.vue   # ② データ取得・状態管理(ロジック層 → リポジトリ)
        └→ components/user/UserDetail.vue      # ③ 表示(Presentational, props-only)
              └→ components/ui/display/...     # ④ 汎用UI部品の組み合わせ
```

データは常に「① → ② → ③ → ④」の一方向に流れる。編集画面の場合は③の位置に`UserForm.vue`が入り、その内部で`ui/input/`の部品(`BaseInput`等)を使う。

- **禁止事項**: ページにドメインの表示ロジックを書かない(それはPresentational/汎用UIの仕事)。API呼び出しを直接書かない(それはロジック層+リポジトリの仕事)。
- **データ取得**: Containerがロジック層 → リポジトリ経由で行う。フレームワークのデータ取得プリミティブの推奨位置との兼ね合いは「6-4.」を参照。
- **Atomic Designとの対応**: ADのpages ≈ ルートコンポーネント(+Container)、ADのtemplates ≈ 最上位のPresentational(`UserDetail.vue`等)。ADでtemplates:pagesが概念上1:N(同じ構造に異なるデータ)であるのと同様、同一Presentationalを複数の文脈(詳細ページとプレビューモーダル等)から再利用できる。Containerもページ以外(モーダル等)から再利用可能で、これが「ページ自身がContainerを兼ねてfetchする方式」ではなく全ページでContainer分離を統一採用した利点。
- **OOUIとの対応**: 「1ビュー = 1ページファイル = 1 Container = 1 Presentationalツリー」がほぼ1:1で対応し、OOUIのビュー単位がそのまま実装の分割単位になる。

### 3-6. 画面遷移の実装方針(ルーティング知識のページ一元化)
遷移を**命令的遷移**(処理結果に応じてコードで遷移する)と**宣言的遷移**(リンク)に分類した上で、**遷移先(URL)の知識はすべてページに一元化**する。Container/Presentationalはルーティングに依存しない。

- **命令的遷移**: Containerは処理の結果をイベントで報告するだけで、遷移APIを呼ばない。遷移するかどうか・どこへ遷移するかはページが決める。
- **宣言的遷移(リンク)**: Presentationalはリンク要素を描画してよいが、遷移先パスは**propsで注入**し、自身はパス構築の知識を持たない。実`<a>`タグの利点(アクセシビリティ、「新しいタブで開く」等)は維持される。
- **採用理由**: 「遷移=ルーティング知識」であり、「URLとビューを結びつける結節点」(「3-5.」)であるページの責務として凝集する。Container/Presentationalからルーティング依存が消えることで、モーダル等ページ以外の文脈での再利用が無条件に可能になり、テストもルーターのモックなしで書ける。
- **不採用とした方式**: 「Containerが遷移APIを実行する方式」は配線が最小で済むが、Containerに遷移先がハードコードされ再利用時に邪魔になるため不採用。「Presentationalがリンクのパスを直接構築する方式」も、ルーティング知識が表示層に分散するため不採用。

Nuxt 3でのコード例は「6-4.」を参照。

### 3-7. 明示的依存の原則(バレル不使用・明示import)
依存関係は常にコード上で追跡可能に保つ。

**バレルファイル(index.tsでの再export)は不使用**。理由は次の3点。

1. **循環importの温床**：バレル経由の相互参照は循環依存を生みやすく、分割統治の観点でも境界を曖昧にする。
2. **参照方法の一本化**：importパスは実ファイルを直接指す1系統に保つ。
3. **ビルドへの悪影響**：tree-shakingを阻害しやすく、コード分割(遅延ロード)の妨げにもなる(ツール固有の追加根拠は「6-3.」)。

階層の深さは書く手間の問題であり、エディタのimport補完・ファイル移動時の自動追従が吸収する。importパスに`ui/input/`が現れることは、**分類情報が利用側に見える**という利点でもある。

**自作コードは明示import**とする。フレームワークが自動import機構を持つ場合も、その対象はフレームワーク組み込みAPIに限定する。理由：自動importは依存関係がコード上に現れず(grepで依存元を追えない)、定義ジャンプが生成された型定義を経由して不安定になり、解析性を損なう。書く便利さはエディタのimport補完で代替できる。追跡したい対象は圧倒的に自作コードであり、フレームワークAPIの出所を疑うことはまずないため、このハイブリッドが実利とノイズのバランスで最良。自動と明示が混在すると「importがない=自動なのか書き忘れなのか」が判別できなくなるため、この方針をプロジェクト全体で貫く。Nuxt 3での設定は「6-1.」を参照。

---

# 第2部 Nuxt 3実装編

## 4. ディレクトリ構成とルーティング対応

### 4-1. 概念マッピングとディレクトリ全体像
第1部2-1の一般対応は、Nuxt 3では次のように具体化される。

| OOUI概念 | Nuxt/Vue実装 |
|---|---|
| オブジェクト(モデル) | ドメイン型(`types/`)＋リポジトリ層(`repositories/`) |
| コレクションビュー(一覧) | `pages/users/index.vue`(＋一覧用Container/Presentationalコンポーネント) |
| シングルビュー(詳細) | `pages/users/[id].vue`(動的ルート) |
| アクション(CRUD) | `create.vue`/編集フォーム、composable経由のAPI呼び出し |
| ルートナビゲーション | `layouts/`＋共通ナビゲーションコンポーネント |
| インタラクション層 | ルーティング＋composables(状態と振る舞い) |
| プレゼンテーション層 | components＋layouts＋スタイル |

Nuxtは`pages/`にファイルを置くだけでVue Routerの設定を自動生成する(ファイルベースルーティング)。`pages/users/index.vue`→`/users`、`pages/users/[id].vue`→`/users/:id`となり、**OOUIのコレクション/シングルがそのままファイルに対応する**。

ディレクトリ例(オブジェクト＝user, product)：
```
app/
├── pages/
│   ├── users/
│   │   ├── index.vue     # コレクション(GET /users)
│   │   ├── [id].vue      # シングル(GET /users/:id)
│   │   └── create.vue    # アクション(作成)
│   └── products/
│       ├── index.vue
│       └── [id].vue
├── components/
│   ├── ui/                    # 汎用UI(ドメイン知識なし) ※原則は「3-1.」「3-2.」
│   │   ├── display/           # 表示系(props-only)
│   │   │   ├── BaseBadge.vue
│   │   │   └── BaseCard.vue
│   │   └── input/             # 入力系(v-model準拠)
│   │       ├── BaseInput.vue
│   │       └── BaseSelect.vue
│   └── user/                  # ドメインコンポーネント(オブジェクト単位) ※配置原則は「3-4.」
│       ├── UserListContainer.vue   # ロジック(一覧取得)
│       ├── UserList.vue            # 表示のみ(Presentational)
│       ├── UserDetailContainer.vue # ロジック(詳細取得)
│       ├── UserDetail.vue          # 表示のみ(Presentational)
│       ├── UserForm.vue
│       └── parts/                  # 内部部品(ドメイン内からのみ参照)
│           └── UserStatusBadge.vue
├── composables/
│   └── useUsers.ts       # リポジトリ抽象に依存する取得/操作ロジック
├── repositories/
│   └── userRepository.ts # API呼び出しを隠蔽(リポジトリ層)
├── types/
│   └── user.ts           # ドメイン型
└── server/
    └── api/
        └── users/
            ├── index.get.ts
            └── [id].get.ts
```

### 4-2. RESTとNitro(server/)
- コレクション：`GET /users` ⇔ `pages/users/index.vue` ⇔ `server/api/users/index.get.ts`
- シングル：`GET /users/:id` ⇔ `pages/users/[id].vue` ⇔ `server/api/users/[id].get.ts`

Nuxt 3の`server/`(Nitro)を使えば、同一リポジトリ内でBFF的にAPIを持ち、`useFetch('/api/users')`の戻り値に型が自動で付く。SSR時はHTTPを介さず直接関数呼び出しになり性能面でも有利。

実例として、Zennの「Nuxt3以降におけるコンポーネントのディレクトリ設計(v0.1)」(著者shun91)では、todoオブジェクトを`pages/todos/`配下に`index.vue`(コレクション)・`[id].vue`(シングル)・`create.vue`として配置し、コンポーネントも`TodoListContainer.vue`/`TodoDetailContainer.vue`/`TodoForm.vue`とオブジェクト単位に分割している。同記事は外部API呼び出しをcomposableとして実装し「いわゆるリポジトリ層に相当」と述べる。

## 5. Nuxt 3のレイヤー設計

### 5-1. Nuxt標準ディレクトリ(おさらい)
- `pages/` … ファイルベースルーティング(ビュー＝OOUIのコレクション/シングル)
- `components/` … 再利用可能なコンポーネント
- `composables/` … Composition APIによる再利用ロジック
- `layouts/` … 共通レイアウト(ルートナビゲーション等)
- `server/` … Nitroによるサーバー処理(API・ミドルウェア)
- `middleware/` … ルートガード(認証・認可)
- `plugins/` … 初期化処理・依存注入
- `layers/` … ローカルレイヤーの自動登録。Nuxt公式ドキュメント逐語で「The layers/ directory auto-registration is available in Nuxt v3.12.0+.」とされ、名前付きレイヤーエイリアス(`#layers/test`)は「Named layer aliases were introduced in Nuxt v3.16.0.」と後から追加された。

※ `components/`・`composables/`の自動importは本プロジェクトでは無効化する(「6-1.」参照)。

なお**Nuxt 4ではデフォルトのsrcDirが`app/`に変更**され、`app/components`, `app/composables`, `app/pages`…という構成になった。Nuxt公式Configuration(v4)では「Default: "app" (Nuxt 4), "." (Nuxt 3 with compatibilityMode: 3)」とされ、公式アップグレードガイドは従来構成を維持する場合「// This reverts the new srcDir default from `app` back to your root directory / srcDir: '.'」と明記、移行自動化として`npx codemod@latest nuxt/4/file-structure`を案内している(理由は「server/がappと同じフォルダにない」ことによるIDEの型安全性とFSウォッチャ起動の改善)。Nuxt 3のEOLが近いため、新規プロジェクトは`app/`構成を前提にするのが無難。

### 5-2. Nuxt Layersによるモジュール分割
Nuxt Layersは、`nuxt.config.ts`を持つサブディレクトリを独立した「ミニNuxtアプリ」として扱い、`extends`で継承できる仕組み。公式ドキュメント(layers v4)は用途を逐語で「Layers are ideal for organizing large codebases with Domain-Driven Design (DDD), creating reusable UI libraries or themes, sharing configuration presets across projects, and separating concerns like admin panels or feature modules.」と述べる。

- **優先順位**：複数レイヤーが同じリソースを定義した場合、優先度の高い方が勝つ。公式ドキュメントは「To control the order, prefix directories with numbers: 1.base/, 2.features/, 3.admin/」と、数字プレフィックスでの制御を明記する。
- **monorepo**：SerKo氏(serko.dev)はpnpm workspace＋Layersで大規模Vueアプリを構築する手法を解説(GitHub: serkodev/nuxt-monorepo)。UIレイヤーを作り、アプリ側で`extends`するだけでコンポーネント/composableを共有できる。
- **モジュラーモノリス**：alexop.dev(Alexander Opalic)は、`layers/shared`・`layers/products`・`layers/cart`のようにオブジェクト単位でレイヤーを切り、`extends: ["./layers/shared", "./layers/products", "./layers/cart"]`で統合する実例を示す(GitHub: alexanderop/nuxt-layer-example)。productsとcartは互いにimportせず、sharedのみに依存する構成で、これを「依存性逆転の原則に従う(高レベルのapp が低レベルのfeatureに依存し、feature同士は依存しない)」と説明している。境界違反をESLintで検出する手法(eslint-plugin-nuxt-layers)も紹介されている。

### 5-3. コンポーネント設計の先行事例(Presentational/Container・Atomic Design)
- **Presentational/Container**：ロジック(データ取得・状態)を持つContainerと、propsで受け取って表示に専念するPresentationalを分ける。GMOメイクショップのテックブログ(2025)は、Vue 3で`defineModel`とslotを使ったContainer/Presentational分離の実例を示し、「UIとロジックの責務を明確に分離することで再利用性・テスト容易性・保守性が向上する」一方「過剰な分割によるオーバーエンジニアリングを避ける工夫が必要」と述べる。
- **Atomic Design**：atoms/molecules/organisms/templates/pagesの5階層。hacomono(2022)は、Nuxt3の`components`配下でドメイン別に分け「Domainデータに紐付くならORGANISMS」というルールで、organisms以上でfetch/状態管理を許可する運用を紹介。OOUI的には「情報設計上のObjectに該当するコンポーネント」をorganisms相当として明示化する考え方(ブレインパッド等)と接続する。
- **アンチパターン**：Vue Fes Japan 2019の沼田佳介氏「アンチパターンから学ぶAtomic Design with Vue.js」は、フレーム通りにAtomic Designを機械的導入した結果「ロジックの集中、コンポーネントの量産」に陥ったと報告し、ドメインを持たせたコンポーネント設計とリポジトリパターンへの組み直しを提案している。
- ※ Atomic Designの5階層分類は「moleculesかorganismsか」の不毛な議論を生みやすいため、本プロジェクトでは採用せず、「汎用UI/ドメイン」の2分類を採用する(「3-1.」参照)。

### 5-4. composablesによるロジック分離とリポジトリ層
- **単一責任**：Vue公式は「状態を持つロジックをカプセル化して再利用する関数」がcomposableと定義。現場記事(Qiita sho_fcafe等)は「Composableの本質は再利用性ではなく責任分離」とし、`useUserAndPosts`のような複数責務を避け、`useUser`/`usePosts`に分けることを推奨する。
- **リポジトリパターン**：API呼び出しをリポジトリ(例：`repositories/userRepository.ts`)に隠蔽し、composableやコンポーネントはその抽象に依存させる。
  - Medium(Luiz Eduardo Zappa)「Nuxt 3 | Repository pattern」は、`repository/factory.ts`＋`repository/modules/products.ts`＋`plugins/api.ts`でドメインごとにリポジトリを分ける構成を示す。ただし元になったVue Mastery記事はSSRで二重リクエストを生む欠点があり、Zappaがその修正版を提示している。
  - Nuxt公式レシピ「Custom useFetch」は、プラグインで`$fetch.create({ baseURL, onRequest, onResponseError })`を作り認証ヘッダ付与や401リダイレクトを一元化し、`useAPI`という型付きcomposableでラップする方法を示す(APIクライアント層の標準的な作り方)。
  - 日本語では for Startups「RepositoryFactoryパターン」、Zenn(m2tkl)の`UserRepository`/`BooksRepository`＋Factory実装があるが、`@nuxtjs/axios`ベースでNuxt 2寄りのため、Nuxt 3では`ofetch`/`$fetch`に読み替える必要がある。

参考：DIP(「2-3.」)を効かせたcomposableの骨組み(概念コード)
```ts
// repositories/userRepository.ts
export interface UserRepository {
  findAll(): Promise<User[]>
  find(id: string): Promise<User>
}
// composables/useUsers.ts — 抽象(UserRepository)に依存し、具体実装は注入する
export function useUsers(repo: UserRepository) {
  const list = () => repo.findAll()          // コレクション
  const detail = (id: string) => repo.find(id) // シングル
  return { list, detail }
}
```
本番実装とモック実装を差し替えられるため、テスト容易性が上がる(L・DIP)。

### 5-5. Piniaと状態管理の位置づけ
- Nuxt 3ではVuexは同梱されず、軽量な`useState`(SSR安全なグローバル状態)と、本格的な`@pinia/nuxt`が選択肢。
- **使い分け**：composableはスコープの限定されたロジック/状態、Piniaはアプリ横断のグローバル状態(認証情報・設定・カート等)に向く。Piniaはアプリスコープの「システムシングルトン」として画面ライフサイクルと独立に状態を保持でき、非同期処理中の画面遷移にも強い。
- **クリーンアーキテクチャ的活用**：Zenn(dateshim)の連載は、PiniaをUseCase層として設計し、Gateway(API)の抽象にStoreが依存し具体をmain.tsで注入することでDIPを実現する構成を提示する。ただし中〜大規模でなければオーバーエンジニアリングになりうる。

## 6. 設計原則のNuxt 3での実現

### 6-1. 自動importの限定設定(「3-7.」の実現)
Nuxtの自動importは**フレームワーク組み込みAPI(`ref`, `useFetch`等)のみ**とし、自作コード(components / composables / repositories)は明示importとする。

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  imports: { dirs: [] },      // composables/ utils/ のスキャンを止める
  components: { dirs: [] },   // components/ のスキャンを止める
})
```

- **派生的な影響**：コンポーネントの自動importを止めたことで、`pathPrefix: false`等の名前解決設定は不要になる(明示importではパスで指定するため、名前のプレフィックス問題自体が消滅する)。ただし命名規約(「3-2.」「3-3.」)は、import文やテンプレート内での可読性のために引き続き採用する。
- **補足**：`NuxtLink`や`ClientOnly`等のNuxt組み込みコンポーネントは、`components.dirs: []`の対象外なので引き続き自動で利用できる。

### 6-2. 表示系/入力系のVue規約(「3-2.」の実現)
- **表示系**：`defineProps`のみで完結し、`defineEmits`を持たない。
- **入力系**：`v-model`(`modelValue` + `update:modelValue`、またはVue 3.4+の`defineModel`)に準拠する。

### 6-3. バレルファイル不使用のVite固有根拠(「3-7.」の補強)
一般的な理由(循環依存・tree-shaking阻害)に加え、Vite環境では1コンポーネントの変更が`index.ts`経由で広範な再評価を誘発するため、HMRやビルドの性能劣化要因として知られる。Nuxt(Vite)ではこの実害が特に大きい。

### 6-4. ページ・Container・遷移の実装例(「3-5.」「3-6.」の実現)

極薄ページとContainer委譲:

```vue
<!-- pages/users/[id].vue -->
<script setup lang="ts">
import UserDetailContainer from '~/components/user/UserDetailContainer.vue'

// definePageMeta / useRoute はフレームワークAPIなので自動import(「6-1.」の方針どおり)
definePageMeta({ middleware: 'auth' })
const route = useRoute()
const userId = route.params.id as string
</script>

<template>
  <UserDetailContainer :user-id="userId" />
</template>
```

命令的遷移(Containerはemitのみ、遷移はページ):

```vue
<!-- pages/users/create.vue -->
<script setup lang="ts">
import UserCreateContainer from '~/components/user/UserCreateContainer.vue'

const detailPath = (id: string) => `/users/${id}`
</script>

<template>
  <!-- Containerは saved をemitするだけ。遷移の実行はページが担う -->
  <UserCreateContainer @saved="(id: string) => navigateTo(detailPath(id))" />
</template>
```

宣言的リンク(パス構築関数をprops注入):

```vue
<!-- pages/users/index.vue -->
<script setup lang="ts">
import UserListContainer from '~/components/user/UserListContainer.vue'

const detailPath = (id: string) => `/users/${id}`
</script>

<template>
  <UserListContainer :detail-path="detailPath" />
</template>
```

```vue
<!-- components/user/UserList.vue (Presentational): 受け取ったパスを描画するだけ -->
<template>
  <ul>
    <li v-for="user in users" :key="user.id">
      <NuxtLink :to="detailPath(user.id)">{{ user.name }}</NuxtLink>
    </li>
  </ul>
</template>
```

- **データ取得位置の注意**：Nuxtの`useAsyncData`はページレベルでの呼び出しが最もイディオマティックだが、本構成ではContainerが担う(「3-5.」)。そのためContainerは必ずページ直下に配置し、fetchを行うコンポーネントのネストを深くしない(SSR時、親の描画を待ってから子がfetchを開始するリクエストのウォーターフォールを回避するため)。

## 7. 実践例・事例
- **OOUI×フロントエンド**：Zenn(s_machino)「フロントエンドエンジニアがOOUIについて理解してみた」、Zenn(dk_)「フロントエンドエンジニアが考えるデザインシステム構築戦略 OOUIの思想からコンポーネント配布まで」が、OOUIをコンポーネント設計に接続する数少ない日本語記事。「UIコンポーネントはドメインオブジェクトの表現である」という視点を提示する。
- **OOUIコレクション/シングルの定義**：Product Design Wiki「コレクションとシングル」、note(YING)「OOUI実践｜Step2」、BONO等が、コレクション＝同種オブジェクトの一覧、シングル＝オブジェクト1件の詳細、と定義。多くのアプリで一覧＝コレクション、詳細＝シングルにあたると明示。
- **OOUI設計実践**：ゼスト、スマートキャンプ、Gaji-Labo、Goodpatch(UIクラス図＝UMLライクなオブジェクト構造図)等のデザイン側実践記事が豊富。
- **大規模Nuxtアーキテクチャ**：SerKo(pnpm workspace＋Layers monorepo/GitHub: serkodev/nuxt-monorepo)、alexop.dev(モジュラーモノリス/GitHub: alexanderop/nuxt-layer-example)、dev.jeromeabel.net(Nuxt 4クリーンアーキテクチャ、Ports & Adapters/GitHub: jeromeabel/nuxt-clean-architecture)。国内ではRevComm(Nuxt 4で大規模管理画面をComposablesで整理)、hacomono、GMOメイクショップ等。
- **実運用サイト**：一休.com(施設詳細等の主要フロントエンド)、東京都のサイト等がNuxtを採用(SSG含む)。

---

## Recommendations

**段階1：小〜中規模／個人開発(まず標準構成で始める)**
- Nuxt標準(Nuxt 4なら`app/`)構成を採用。`pages/[object]/index.vue`(コレクション)＋`pages/[object]/[id].vue`(シングル)でOOUIのビューをそのままルーティングに写像する。
- OOUI 3ステップ(オブジェクト抽出→ビュー/ナビ→レイアウト)を紙/Figmaで先に回し、抽出したオブジェクトをそのままpages/型/リポジトリの単位にする。
- ロジックはcomposableに切り出し「1 composable = 1責務」を守る。API呼び出しはプラグインで作ったカスタム`$fetch`＋`useAPI`に集約(段階1ではフルなリポジトリ抽象は不要)。
- 状態はまず`useState`、認証など横断的なものだけPinia。
- **閾値**：ページ/コンポーネントが増え「特定ドメインのファイルを探すのが辛い」と感じたら段階2へ。

**段階2：中規模(ドメイン別＝feature/オブジェクト別へ)**
- `app/features/<object>/`にpages/components/composablesを束ねる。共通は`app/components`等に残す。
- API層をリポジトリ(`repositories/<object>Repository.ts`)として明示化し、composableはリポジトリ抽象に依存させる(DIP)。本番/モックを差し替え可能にしテストを書く。
- ページレベルのContainer/Presentational分離は規模によらず一律適用する(「3-5.」の決定事項)。ページ以外のコンポーネントへの分割は強制せず、ロジックの複雑さに応じて導入する。
- **閾値**：複数アプリ(管理画面＋ユーザー画面等)や複数チーム、再利用UIライブラリが必要になったら段階3へ。

**段階3：大規模／複数アプリ(Nuxt Layers／monorepo)**
- オブジェクト/ドメイン単位でNuxt Layersを切り、`extends`で合成。feature同士は直接importせず`shared`層のみに依存させる(DIPの徹底)。境界はESLint(eslint-plugin-nuxt-layers等)で強制。
- pnpm workspaceでmonorepo化し、UI/APIクライアントをレイヤーとして共有(SerKo方式)。
- Layer優先順位は数字プレフィックス(`1.base/`, `2.features/`, `3.admin/`)で明示。

**共通の指針**
- 「まずオブジェクト、次にタスク」を設計・実装の両方で貫く。ページ=オブジェクトのビュー、コンポーネント=オブジェクトの表現、と対応づける。
- 分割統治の単位はOOUIのオブジェクトに揃える(モデリングとアーキテクチャの一致)。
- コンポーネントは「汎用UI(表示系/入力系)/ドメイン」で分類し、依存は一方向に保つ(「3-1.」「3-2.」の決定事項)。
- 自作コードは明示importとし、依存関係を常にコード上で追跡可能に保つ(「3-7.」の決定事項)。
- pagesは「URLとビューを結びつける結節点」に徹し、ドメイン表示ロジックやAPI呼び出しを書かない(「3-5.」の決定事項)。
- 画面遷移の知識(命令的遷移の実行・リンク先パスの構築)はページに一元化し、Container/Presentationalはルーティングに依存しない(「3-6.」の決定事項)。

**構成案の推奨度まとめ**

| 構成 | 推奨度 | 適する場面 | 理由 |
|---|---|---|---|
| 標準(レイヤー別) | ◎(小規模) | 個人開発・PoC | Zero config、学習コスト最小。ただし規模拡大で破綻しやすい |
| feature/オブジェクト別 | ◎(中規模) | チーム開発・成長期 | OOUIオブジェクトと分割単位が一致。凝集度が高い |
| Nuxt Layers/monorepo | ○(大規模) | 複数アプリ・大規模 | 明確な境界とDIP強制が可能。ただし設定・運用コスト増 |
| クリーンアーキテクチャ全面適用 | △ | ロジックが厚い業務系のみ | 効果は大きいが小規模ではオーバーエンジニアリング |

---

## Caveats
- **OOUIとNuxt実装を一体で論じた決定版記事は存在しない**。本メモの対応表は、OOUIデザイン側の定義とNuxt実装知見を筆者が合成したもの。「唯一の正解構成」は存在せず、チーム・プロダクト特性に応じた調整が前提。
- **ソシオメディアの「画面数5〜20分の1」等の効果値は、同社のコンサルティング経験に基づく主張**であり、一般化された実証値ではない。OOUIはあくまで情報構造(UX5段階の「構造」層)の設計手法で、導入すれば自動的に良いUIになるものではない(スマートキャンプ等も「過剰な期待は危険」と明言)。
- **リポジトリパターンの現場記事は鮮度差が大きい**。laurentcazanoveのprovide/inject記事は著者自身が「もう推奨しない(I don't advise following its guidance anymore)」と警告、Vue Mastery系はSSR二重リクエストの注意、m2tkl/for Startupsは`@nuxtjs/axios`ベースでNuxt 2寄り。Nuxt 3/4では`ofetch`/`$fetch`・Nitro・カスタム`useFetch`を前提に読み替える必要がある。
- **クリーンアーキテクチャ/Layers/Atomic Designの過剰導入はアンチパターン**。dev.jeromeabel等の著者も「実験的(hands-on experiment)」と断り、Atomic Designは機械的導入で「ロジック集中・コンポーネント量産」を招いた事例がある。規模と必要性に見合った段階的採用を。
- **自動import無効化はNuxtエコシステムの標準から逸脱する**(「6-1.」)。公式ドキュメントやサンプルコードは自動import前提で書かれているため、写経時にimport文を補う手間が発生する。解析性とのトレードオフとして意図的に受け入れている点を忘れないこと。
- **表示系/入力系の分類は厳密な二分を強制しない**(「3-2.」)。混合型は入力系扱いという逃げ道を規約に含めており、分類議論が目的化しないよう注意。
- **全ページでのContainer委譲統一により、データ取得の位置がページからContainerへ下がる**(「3-5.」「6-4.」)。Nuxtの`useAsyncData`はページレベルでの呼び出しが最もイディオマティックであるため、Containerは必ずページ直下に置き、fetchするコンポーネントのネストを深くしないこと。個人開発の小規模フェーズではファイル数増というコストも意図的に受け入れている。
- **遷移のページ一元化はemit/props配線を増やす**(「3-6.」)。Containerの無条件な再利用性とルーティング知識の一元化の対価として意図的に受け入れている。画面数が少ないうちは冗長に感じられるが、規約に例外を作らないこと。
- **第1部の原則にもフレームワークの痕跡が残る箇所がある**。表示系/入力系のインターフェース規約は双方向バインディングという中立表現にしたが、Reactでは controlled component(value + onChange)への読み替えが必要。Next.js(App Router)ではServer Componentsの導入によりContainer/Presentationalの境界やデータ取得位置の考え方自体が変わるため、第1部3-5/3-6は移植時に再検討が必要。
- **Nuxt 3はEOLが近く、Nuxt 4(app/構成)が現行**。ディレクトリ例はNuxt 4準拠にするか、`srcDir`設定で明示すること。将来のNuxt 5(Nitro v3ベース)も見据える必要がある。
- 個別の数値・引用は各一次資料(特にソシオメディア公式および『オブジェクト指向UIデザイン』書籍)に当たって確認することを推奨。
