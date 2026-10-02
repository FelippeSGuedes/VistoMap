#!/bin/sh
# Otimiza os modelos 3D das torres pro uso no mapa.
#
# POR QUE: os GLB saem do Tripo em qualidade de render offline — 213 mil
# triângulos e TRÊS texturas 4096x4096 cada. Só as texturas pedem ~268 MB de
# VRAM por modelo (537 MB pelos dois), o que derruba o mapa em qualquer
# máquina. E numa torre que ocupa algumas dezenas de pixels na tela, nada
# disso é visível.
#
# RESULTADO MEDIDO (2026-10-02):
#   Torre_claro.glb  14,31 MB -> torre-claro.glb  527 KB   (-96%)
#   torre_vivo.glb   13,46 MB -> torre-vivo.glb   500 KB   (-96%)
#   malha  213k -> 17k triângulos | texturas 4096 -> 256 | VRAM 268 MB -> 1 MB
#
# --compress quantize e NÃO meshopt/draco (que comprimem mais): o
# KHR_mesh_quantization é suportado NATIVAMENTE pelo GLTFLoader do three,
# enquanto meshopt e draco exigem carregar um decoder em runtime. Não vale
# somar um decoder ao bundle pra economizar ~200 KB.
#
# Os ORIGINAIS (Torre_claro.glb / torre_vivo.glb, 28 MB somados) ficam FORA
# do repositório de propósito — ver .gitignore. Guarde-os fora daqui se
# quiser poder rodar este script de novo.
#
# Uso: sh scripts/otimizar-torres-glb.sh
set -e

otimizar() {
  src="$1"; dst="$2"
  if [ ! -f "$src" ]; then
    echo "pulando $dst: $src não está presente (original fora do repo, ver comentário acima)"
    return 0
  fi
  npx --yes @gltf-transform/cli@4 optimize "$src" "$dst" \
    --compress quantize \
    --texture-size 256 \
    --texture-compress auto \
    --simplify-ratio 0.08 \
    --simplify-error 0.002
}

otimizar public/Torre_claro.glb public/torre-claro.glb
otimizar public/torre_vivo.glb  public/torre-vivo.glb
