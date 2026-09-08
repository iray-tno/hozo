import { Heading, Paragraph, Section, Text, View } from '@hozo/core'

export function Philosophy() {
  return (
    <Section nativeID="philosophy" className="py-24 border-t border-wood relative bg-yakisugi-900">
      <View className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <View className="text-center max-w-3xl mx-auto mb-16 flex flex-col items-center">
          <Text className="text-xs font-bold uppercase tracking-widest text-hinoki mb-3 block">
            Core Philosophy
          </Text>
          <Heading
            level={2}
            className="text-3xl sm:text-5xl font-extrabold text-shikkui tracking-tight mb-4"
          >
            「ほぞ継ぎ」の構造美学
          </Heading>
          <Paragraph className="text-shikkui-muted text-base sm:text-lg leading-relaxed">
            金物や接着剤を使わず、材と材の凹凸を寸分の狂いなく噛み合わせる日本の伝統木工「ほぞ継ぎ」。
            Hozo は React Native、Semantic Web、Tailwind CSS、そして厳格なアクセシビリティを、
            無駄なランタイムを削ぎ落として一つに結合します。
          </Paragraph>
        </View>

        <View className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Pillar 1 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-wood-subtle border border-wood flex items-center justify-center text-hinoki font-bold text-lg mb-6 group-hover:scale-105 transition-transform">
              一
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              既存の資産をそのまま組む (Existing Source First)
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              独自の記法や書き直しは不要。
              <code className="text-shikkui-muted text-xs font-mono">react-native</code>{' '}
              からインポートされた既存のコンポーネントを直接解析・コンパイルします。現場のコードを壊さず漸進的に導入可能です。
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-shikkui-muted font-mono">
              <Text className="text-hinoki">import</Text> {'{ View, Text }'}{' '}
              <Text className="text-hinoki">from</Text>{' '}
              <Text className="text-tatami-light">'react-native'</Text>
            </View>
          </View>

          {/* Pillar 2 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-bengara-subtle border border-bengara-subtle flex items-center justify-center text-bengara font-bold text-lg mb-6 group-hover:scale-105 transition-transform">
              二
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              新規開発の王道 (Golden Path for New Projects)
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              <code className="text-shikkui-muted text-xs font-mono">@hozo/core</code>{' '}
              が提供する標準セマンティックプリミティブ（
              <code className="text-shikkui-muted text-xs font-mono">Heading</code>,{' '}
              <code className="text-shikkui-muted text-xs font-mono">Paragraph</code>,{' '}
              <code className="text-shikkui-muted text-xs font-mono">Section</code>,{' '}
              <code className="text-shikkui-muted text-xs font-mono">Button</code>
              ）を使えば、最初から最速かつ最もアクセシブルな構造を記述できます。
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-shikkui-muted font-mono">
              <Text className="text-hinoki">import</Text> {'{ Heading, Button }'}{' '}
              <Text className="text-hinoki">from</Text>{' '}
              <Text className="text-bengara">'@hozo/core'</Text>
            </View>
          </View>

          {/* Pillar 3 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-tatami-subtle border border-tatami-subtle flex items-center justify-center text-tatami-light font-bold text-lg mb-6 group-hover:scale-105 transition-transform">
              三
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              静的に削り出し、動的に支える (Compile What You Can)
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              静的に決まるスタイルはすべて本物の CSS / StyleSheet
              へ事前コンパイル（ゼロランタイム）。条件分岐はブール値に畳み込み、真に動的な値のみキャッシュされた安全なランタイムへ委譲します。
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-tatami-light font-mono">
              静的 (0ms) &rarr; 構造分岐 (ブール値展開) &rarr; 動的フォールバック
            </View>
          </View>

          {/* Pillar 4 */}
          <View className="p-8 rounded-2xl timber-panel relative overflow-hidden group hover:border-wood-strong transition-all border border-wood">
            <View className="w-12 h-12 rounded-xl bg-wood-subtle border border-wood flex items-center justify-center text-hinoki-light font-bold text-lg mb-6 group-hover:scale-105 transition-transform">
              四
            </View>
            <Heading level={3} className="text-xl font-bold text-shikkui mb-3">
              構造としてのアクセシビリティ (Accessibility by Structure)
            </Heading>
            <Paragraph className="text-stone-400 text-sm leading-relaxed mb-4">
              ARIA を第一級の文法として扱います。
              <code className="text-shikkui-muted text-xs font-mono">aria-query</code>{' '}
              によりロールと必須属性をコンパイル時に検証。
              <code className="text-shikkui-muted text-xs font-mono">@hozo/behaviors</code>{' '}
              によるフォーカストラップと roving tabindex で完全な操作性を保証します。
            </Paragraph>
            <View className="p-3 rounded-lg bg-yakisugi-950 border border-wood text-xs text-hinoki-light font-mono">
              ビルド時 W3C ARIA 静的診断 + ネイティブ振る舞い層
            </View>
          </View>
        </View>
      </View>
    </Section>
  )
}
