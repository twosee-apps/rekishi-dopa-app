// オリジナルマスコット「ハッピー」：法被（ハッピ）を着て紅白のハチマキを巻いた、まるいおもちのようなゆるキャラ（2026-10-20 巻物の「まきまる」から描き直し・候補 H1）
// 表情（mood）は #mascot の data-mood で切り替える：normal / happy / combo / oops / festival
// 着せ替え（outfit）は data-outfit で切り替える：none / chonmage / jingasa / eboshi / hakase / kabuto
// 進化（12回目）は data-evo（0〜6）で切り替える。色・かざり・光の輪だけを変え、大きさと形は変えない（着せ替えはどの段階にも重なる）
// 部品のクラス名は巻物のときと同じ（style.css の切り替えをそのまま使う）：
//   .m-jiku＝ハッピのえり（進化で朱色→金色）／.m-jiku-hl＝すその白い線／.m-himo・.m-himo-dot＝帯の結びひも（進化でむらさき）
//   .m-lines＝腹掛けのもよう（花もんが出たら消える）／.m-evo-crest＝胸の花もん／.m-evo-nishiki＝すその金のかざり
//   .m-hachimaki＝祭りのときに足す、長くなびくハチマキのはし（ふだんのハチマキはいつも巻いている）
// かわいく見せる決まり（人気のキャラクターに多い特徴）：頭を大きく・手足は短く／目は顔のまん中より下・目と口を寄せる・口は小さく／丸い形・線を少なく
export const MASCOT_NAME = 'ハッピー';

export const MOODS = ['normal', 'happy', 'combo', 'oops', 'festival'];

const INK = '#3b2414';
const P = {"skin":"#fff4e2","hem":"#fff6dc","eri":"#fff6dc","inner":"#fff6dc","innerLine":"#ecd9a8","tabi":"#3a3a4a","hachi":"#fff6dc","hachiTwist":"#e63946","happi":"#2f5aa8","obi":"#e63946","himo":"#e63946"};
// 顔（目・口）は巻物のときの線を、顔の下寄りへ少し小さくして寄せる
const FACE = 'translate(80 104) scale(.8) translate(-80 -100)';

export function mascotSVG() {
  return `
<svg viewBox="0 0 160 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${MASCOT_NAME}">
  <ellipse class="m-shadow" cx="80" cy="182" rx="36" ry="6" fill="#000" opacity=".22"/>
  <!-- 進化：光の輪（段階5〜）。からだの後ろ -->
  <g class="m-evo m-evo-aura">
    <ellipse cx="80" cy="104" rx="74" ry="82" fill="none" stroke="#ffd34d" stroke-width="14" opacity=".22"/>
    <ellipse cx="80" cy="104" rx="74" ry="82" fill="none" stroke="#ffd34d" stroke-width="3.5" opacity=".9"/>
    <ellipse class="m-evo-aura2" cx="80" cy="104" rx="64" ry="72" fill="none" stroke="#fff0a0" stroke-width="2" opacity=".75"/>
  </g>
  <g class="m-body">
    <!-- 足 -->
    <ellipse cx="66" cy="174" rx="11" ry="7" fill="${P.tabi}" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="94" cy="174" rx="11" ry="7" fill="${P.tabi}" stroke="${INK}" stroke-width="3"/>
    <!-- 腕（みじかめ・先が丸い手） -->
    <g class="m-arm m-arm-l"><path d="M50 148 q-12 -2 -17 -13" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M50 148 q-12 -2 -17 -13" stroke="${P.skin}" stroke-width="5" fill="none" stroke-linecap="round"/></g>
    <g class="m-arm m-arm-r"><path d="M110 148 q12 -2 17 -13" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M110 148 q12 -2 17 -13" stroke="${P.skin}" stroke-width="5" fill="none" stroke-linecap="round"/></g>
    <!-- ハッピ：そで -->
    <path d="M60 134 L48 137 Q42 139 43 145 L45 154 Q46 158 51 157 L62 155 Z" fill="${P.happi}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M100 134 L112 137 Q118 139 117 145 L115 154 Q114 158 109 157 L98 155 Z" fill="${P.happi}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <!-- ハッピ：みごろ -->
    <path d="M58 130 Q80 126 102 130 L107 164 Q108 170 102 170 L58 170 Q52 170 53 164 Z" fill="${P.happi}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <path class="m-jiku-hl" d="M56 163.5 H104" stroke="${P.hem}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- 進化：すその金のかざり（段階4〜） -->
    <g class="m-evo m-evo-nishiki" stroke-linecap="round">
      <path d="M55 167 H105" stroke="#d9a21b" stroke-width="4"/>
      <path d="M45 151 L60 149 M115 151 L100 149" stroke="#d9a21b" stroke-width="3"/>
    </g>
    <!-- 腹掛け（えりのあいだ） -->
    <path d="M72 130 L88 130 L92 169 L68 169 Z" fill="${P.inner}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <g class="m-lines">
      <path d="M75 140 h10" stroke="${P.innerLine}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M74.5 145 h11" stroke="${P.innerLine}" stroke-width="2.5" stroke-linecap="round"/>
    </g>
    <!-- 進化：花のもんよう（段階2〜）。胸 -->
    <g class="m-evo m-evo-crest" transform="translate(80 142) scale(.62)">
      <circle cx="0" cy="-7" r="5" fill="#ff9fb4"/><circle cx="6.7" cy="-2.2" r="5" fill="#ff9fb4"/>
      <circle cx="4.1" cy="5.7" r="5" fill="#ff9fb4"/><circle cx="-4.1" cy="5.7" r="5" fill="#ff9fb4"/>
      <circle cx="-6.7" cy="-2.2" r="5" fill="#ff9fb4"/><circle cx="0" cy="0" r="3.2" fill="#f6c14d"/>
    </g>
    <!-- ハッピ：えり（進化で朱色→金色） -->
    <path class="m-jiku" d="M68.5 129 L74 129 L68.5 169.5 L63 169.5 Z" fill="${P.eri}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path class="m-jiku" d="M91.5 129 L86 129 L91.5 169.5 L97 169.5 Z" fill="${P.eri}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <!-- 帯 -->
    <path d="M53.5 152 Q80 156 106.5 152 L107.5 159 Q80 163 52.5 159 Z" fill="${P.obi}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <!-- 帯の結びひも（進化でむらさき） -->
    <path class="m-himo" d="M100 159 q5 7 2 14" stroke="${P.himo}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle class="m-himo-dot" cx="102" cy="175" r="4.2" fill="${P.himo}" stroke="${INK}" stroke-width="2"/>

    <!-- 頭（まるいおもち） -->
    <path d="M80 42 C116 42 136 64 136 94 C136 118 112 131 80 131 C48 131 24 118 24 94 C24 64 44 42 80 42 Z" fill="${P.skin}" stroke="${INK}" stroke-width="4"/>

    <!-- ハチマキ（いつも）：ねじり鉢巻 -->
    <path d="M27.5 67 Q80 50 132.5 67 L134 78 Q80 61 26 78 Z" fill="${P.hachi}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M28 72.5 Q80 55.5 133.5 72.5" stroke="${P.hachiTwist}" stroke-width="5" fill="none" stroke-dasharray="5 6"/>
    <path d="M133 70 l13 -8 M133 75 l15 3" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
    <path d="M133 70 l13 -8 M133 75 l15 3" stroke="${P.hachi}" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="133" cy="72.5" r="6" fill="${P.hachi}" stroke="${INK}" stroke-width="3"/>

    <!-- ほっぺ -->
    <ellipse cx="50" cy="109" rx="10" ry="6.5" fill="#ff8fa3" opacity=".8"/>
    <ellipse cx="110" cy="109" rx="10" ry="6.5" fill="#ff8fa3" opacity=".8"/>

    <g transform="${FACE}">
    <!-- 目：ふつう -->
    <g class="m-eyes m-eyes-normal">
      <ellipse cx="60" cy="94" rx="9" ry="12" fill="${INK}"/><ellipse cx="100" cy="94" rx="9" ry="12" fill="${INK}"/>
      <circle cx="63" cy="89" r="3.6" fill="#fff"/><circle cx="103" cy="89" r="3.6" fill="#fff"/>
      <circle cx="57" cy="99" r="1.8" fill="#fff"/><circle cx="97" cy="99" r="1.8" fill="#fff"/>
    </g>
    <!-- 目：正解（にっこり） -->
    <g class="m-eyes m-eyes-happy">
      <path d="M50 98 q10 -14 20 0" stroke="${INK}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
      <path d="M90 98 q10 -14 20 0" stroke="${INK}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    </g>
    <!-- 目：コンボ（星） -->
    <g class="m-eyes m-eyes-combo">
      <path d="M60 81 l3.8 8 8.7 1 -6.4 6 1.8 8.6 -7.9 -4.4 -7.9 4.4 1.8 -8.6 -6.4 -6 8.7 -1z" fill="#ffc300" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M100 81 l3.8 8 8.7 1 -6.4 6 1.8 8.6 -7.9 -4.4 -7.9 4.4 1.8 -8.6 -6.4 -6 8.7 -1z" fill="#ffc300" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    </g>
    <!-- 目：不正解（ちょっと残念。まゆが下がる） -->
    <g class="m-eyes m-eyes-oops">
      <path d="M48 85 l16 -6" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M112 85 l-16 -6" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="60" cy="97" rx="7" ry="8" fill="${INK}"/><ellipse cx="100" cy="97" rx="7" ry="8" fill="${INK}"/>
      <circle cx="62" cy="94" r="2.4" fill="#fff"/><circle cx="102" cy="94" r="2.4" fill="#fff"/>
    </g>
    <!-- 目：祭り（><） -->
    <g class="m-eyes m-eyes-festival">
      <path d="M52 87 l14 8 -14 8" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M108 87 l-14 8 14 8" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </g>

    <!-- 口（顔に寄せて小さく） -->
    <path class="m-mouth m-mouth-normal" d="M74 110 q6 6 12 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <g class="m-mouth m-mouth-happy">
      <path d="M70 108 q10 15 20 0 z" fill="#c2272d" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M75 116 q5 -4 10 0" fill="#ff8fa3"/>
    </g>
    <g class="m-mouth m-mouth-combo">
      <path d="M67 107 q13 21 26 0 z" fill="#c2272d" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M73 117 q7 -5 14 0" fill="#ff8fa3"/>
    </g>
    <path class="m-mouth m-mouth-oops" d="M71 114 q4.5 -5 9 0 q4.5 5 9 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <g class="m-mouth m-mouth-festival">
      <ellipse cx="80" cy="112" rx="9" ry="8" fill="#c2272d" stroke="${INK}" stroke-width="3.5"/>
      <path d="M74 116 q6 -4 12 0" fill="#ff8fa3"/>
    </g>
    </g>

    <!-- 汗（不正解） -->
    <path class="m-sweat" d="M120 86 q8 12 0 16 q-8 -4 0 -16z" fill="#7cc6ff" stroke="${INK}" stroke-width="2.5"/>
    <!-- きらきら（コンボ） -->
    <g class="m-sparkle" fill="#fff6a8" stroke="${INK}" stroke-width="2">
      <path d="M12 80 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z"/>
      <path d="M148 118 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z"/>
    </g>
    <!-- 祭り・段階5〜：ハチマキのはしが長くなびく -->
    <g class="m-hachimaki">
      <path d="M136 69 q11 -16 22 -16 M136 75 q12 4 20 16" stroke="${INK}" stroke-width="10" fill="none" stroke-linecap="round"/>
      <path d="M136 69 q11 -16 22 -16 M136 75 q12 4 20 16" stroke="${P.hachi}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
      <path d="M136 69 q11 -16 22 -16 M136 75 q12 4 20 16" stroke="${P.hachiTwist}" stroke-width="5.5" fill="none" stroke-dasharray="4 5"/>
      <path d="M16 56 l-8 -4 M14 66 h-9 M16 76 l-8 4" stroke="#fff6a8" stroke-width="3" stroke-linecap="round"/>
    </g>

    <!-- 進化：まわりの星（段階6） -->
    <g class="m-evo m-evo-stars" fill="#ffd34d" stroke="${INK}" stroke-width="1.5">
      <path d="M6 128 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
      <path d="M152 150 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
      <path d="M150 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
    </g>

    <!-- 着せ替え（頭の上にのせる） -->
    <g class="m-outfit m-outfit-chonmage" transform="translate(0 3)">
      <path d="M68 38 q12 -26 24 0" fill="${INK}" stroke="${INK}" stroke-width="3"/>
      <rect x="62" y="16" width="36" height="9" rx="4.5" fill="${INK}"/>
      <rect x="74" y="18" width="12" height="5" fill="#e63946"/>
    </g>
    <g class="m-outfit m-outfit-jingasa" transform="translate(0 8)">
      <path d="M14 40 q66 -46 132 0 q-66 -10 -132 0z" fill="#2b2b2b" stroke="${INK}" stroke-width="3"/>
      <circle cx="80" cy="20" r="7" fill="#f6c14d" stroke="${INK}" stroke-width="2.5"/>
    </g>
    <g class="m-outfit m-outfit-eboshi" transform="translate(0 4)">
      <path d="M58 40 q-2 -34 30 -36 q-10 14 6 36z" fill="#1f1f1f" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    </g>
    <g class="m-outfit m-outfit-hakase" transform="translate(0 6)">
      <path d="M44 34 h72 v8 h-72z" fill="#1d2440" stroke="${INK}" stroke-width="3"/>
      <path d="M30 22 l50 -14 50 14 -50 14z" fill="#1d2440" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M118 22 v22" stroke="#ffc300" stroke-width="3"/><circle cx="118" cy="46" r="4" fill="#ffc300"/>
    </g>
    <g class="m-outfit m-outfit-kabuto" transform="translate(0 8)">
      <path d="M28 42 q52 -40 104 0z" fill="#3a3f78" stroke="${INK}" stroke-width="3"/>
      <path d="M80 26 q-30 -6 -40 -24 q22 10 40 14 q18 -4 40 -14 q-10 18 -40 24z" fill="#ffc300" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="80" cy="30" r="6" fill="#e63946" stroke="${INK}" stroke-width="2.5"/>
    </g>
  </g>
</svg>`;
}
