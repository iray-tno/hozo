import { Heading, Paragraph, Section, Text, View } from '@hozo/core'

export function TieredStyles() {
  return (
    <Section
      nativeID="tiered-styles"
      className="py-24 border-t border-wood relative bg-gradient-to-b from-transparent via-yakisugi-950 to-transparent"
    >
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Style Engine
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            3段構えのスタイル解決 (Tiered Resolution)
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            クラス名が動的でも、Hozo は妥協しません。完全な静的抽出から構造的ブール展開、
            そして最終手段の動的キャッシュまで、三層の仕口でランタイム負荷を極小化します。
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tier 1 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-tatami-light border-x border-b border-wood flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-tatami-subtle text-tatami-light border border-tatami-subtle">
                  第1層 • 静的 (Static)
                </Text>
                <Text className="text-xs font-mono text-tatami-light font-semibold">
                  0ms Runtime
                </Text>
              </View>
              <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
                削り出し（完全消去）
              </Heading>
              <Paragraph className="text-stone-400 text-sm mb-6">
                文字列リテラルはビルド時に完全抽出。Web では本物の CSS クラス、Native では計算済みの
                StyleSheet オブジェクトへと展開されます。
              </Paragraph>
              <div className="rounded-xl bg-yakisugi-950 border border-wood p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// 入力 (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  <Text className="text-tatami-light">"p-4 bg-blue-500"</Text> /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">{'// Web 出力 (Pure HTML)'}</Text>
                <Text className="text-tatami-light block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">class</Text>=
                  <Text className="text-tatami-light">"hz-p-4 hz-bg-blue-500"</Text> /&gt;
                </Text>
              </div>
            </View>
            <View className="text-xs text-stone-400 border-t border-wood pt-4">
              &bull; JavaScript ランタイムコスト 0<br />
              &bull; ブラウザネイティブの CSS カスケード
            </View>
          </View>

          {/* Tier 2 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-hinoki border-x border-b border-wood flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-wood-subtle text-hinoki-light border border-wood">
                  第2層 • 構造的 (Structural)
                </Text>
                <Text className="text-xs font-mono text-hinoki font-semibold">Boolean Toggle</Text>
              </View>
              <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
                条件分岐の事前展開
              </Heading>
              <Paragraph className="text-stone-400 text-sm mb-6">
                <code className="text-shikkui-muted text-xs font-mono">cn(...)</code> などの条件式は
                AST
                を保持したまま両方の枝をビルド時に事前コンパイル。実行時には真偽値の反転のみが残ります。
              </Paragraph>
              <div className="rounded-xl bg-yakisugi-950 border border-wood p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// 入力 (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>=
                  {`={cn('p-4', active && 'bg-blue-500')}`} /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">{'// Web 出力'}</Text>
                <Text className="text-hinoki block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">class</Text>=
                  {`={"hz-p-4 " + (active ? "hz-bg-blue-500" : "")}`} /&gt;
                </Text>
              </div>
            </View>
            <View className="text-xs text-stone-400 border-t border-wood pt-4">
              &bull; 事前計算済み CSS クラス名
              <br />
              &bull; 実行時スタイル再計算エンジンの排除
            </View>
          </View>

          {/* Tier 3 */}
          <View className="rounded-2xl timber-panel p-6 border-t-2 border-t-bengara border-x border-b border-wood flex flex-col justify-between">
            <View>
              <View className="flex items-center justify-between mb-4">
                <Text className="text-xs font-bold px-2.5 py-1 rounded bg-bengara-subtle text-bengara-hover border border-bengara-subtle">
                  第3層 • 動的 (Dynamic)
                </Text>
                <Text className="text-xs font-mono text-bengara font-semibold">
                  Cached Fallback
                </Text>
              </View>
              <Heading level={3} className="text-lg font-bold text-shikkui mb-2">
                プロジェクト全体キャッシュ
              </Heading>
              <Paragraph className="text-stone-400 text-sm mb-6">
                props や外部から渡される未知の変数について、Hozo
                はプロジェクト内の候補クラスを走査・事前生成し、高速キャッシュルックアップで対応します。
              </Paragraph>
              <div className="rounded-xl bg-yakisugi-950 border border-wood p-4 font-mono text-xs text-shikkui-muted mb-4 overflow-x-auto">
                <Text className="text-stone-500 block mb-1">{'// 入力 (Source)'}</Text>
                <Text className="text-shikkui block mb-3">
                  &lt;<Text className="text-hinoki">View</Text>{' '}
                  <Text className="text-hinoki-light">className</Text>={`={props.className}`} /&gt;
                </Text>
                <Text className="text-stone-500 block mb-1">{'// Web 出力'}</Text>
                <Text className="text-bengara block">
                  &lt;<Text className="text-hinoki">div</Text>{' '}
                  <Text className="text-hinoki-light">class</Text>={`={hzRuntime(props.className)}`}{' '}
                  /&gt;
                </Text>
              </div>
            </View>
            <View className="text-xs text-stone-400 border-t border-wood pt-4">
              &bull; インクリメンタルな候補キャッシュ
              <br />
              &bull; CSS ルールの抜け漏れを根絶
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
