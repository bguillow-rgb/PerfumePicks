#!/bin/bash
# Upload Dunbarton Tobacco & Trust official images to Supabase Storage
# and update cigar records with new image URLs

set -e

SUPABASE_URL="https://nwxnympcfwydxzjkmmas.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53eG55bXBjZnd5ZHh6amttbWFzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxOTk1MywiZXhwIjoyMDkxMDk1OTUzfQ.itHksNzwzKrKv0nnbaJwnhFR1XoVp8uov8N1MsbDQLI"
BUCKET="cigar-images"
SRC_DIR="${SRC_DIR:-$(cd "$(dirname "$0")/.." && pwd)/scripts/data/dropbox-images}"
RESIZED_DIR="/tmp/dtt-resized"
mkdir -p "$RESIZED_DIR"

# Function to resize, convert to JPEG, and upload
upload_image() {
  local src_path="$1"
  local storage_name="$2"

  local resized_path="$RESIZED_DIR/$storage_name"

  # Resize to max 800px wide, convert to JPEG, 85% quality
  sips -s format jpeg -s formatOptions 85 --resampleWidth 800 "$src_path" --out "$resized_path" 2>/dev/null

  # Upload to Supabase Storage
  local content_type="image/jpeg"
  curl -s -X POST "$SUPABASE_URL/storage/v1/object/$BUCKET/dtt/$storage_name" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: $content_type" \
    -H "x-upsert: true" \
    --data-binary "@$resized_path" | jq -r '.Key // .error // "unknown error"'

  echo "  → Uploaded dtt/$storage_name"
}

# Function to update cigar image_url in DB
update_cigar_image() {
  local brand="$1"
  local name_filter="$2"
  local storage_name="$3"
  local public_url="$SUPABASE_URL/storage/v1/object/public/$BUCKET/dtt/$storage_name"

  # URL encode the brand for the query
  local encoded_brand=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$brand'))")

  local response=$(curl -s -X PATCH "$SUPABASE_URL/rest/v1/cigars?brand=eq.$encoded_brand&$name_filter" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "{\"image_url\": \"$public_url\"}")

  local count=$(echo "$response" | jq length)
  echo "  ✅ Updated $count cigars for $brand ($name_filter) → $storage_name"
}

echo "========================================="
echo "Uploading DTT Official Product Images"
echo "========================================="
echo ""

# 1. SOBREMESA - use box open photo for main brand
echo "📦 Sobremesa..."
upload_image "$SRC_DIR/Images - Product/1 - Sobremesa Images/d - Sobremesa Brulee Blue Product Photos/Saka_Sobremesa_BruleeBlue_Vitola_0821.png" "sobremesa.jpg"
update_cigar_image "Sobremesa" "name=ilike.*Cervantes*" "sobremesa.jpg"
update_cigar_image "Dunbarton Tobacco & Trust" "name=ilike.*Sobremesa*&name=not.ilike.*Brulee*" "sobremesa.jpg"

# Sobremesa Brulee
upload_image "$SRC_DIR/Images - Product/1 - Sobremesa Images/e - Sobremesa Brulee Wagashi Product Photos/SOBREMESA_WAGASHI_SINGLE.png" "sobremesa-brulee.jpg"
update_cigar_image "Dunbarton Tobacco & Trust" "name=ilike.*Sobremesa%20Brulee*" "sobremesa-brulee.jpg"

echo ""

# 2. MI QUERIDA
echo "📦 Mi Querida..."
upload_image "$SRC_DIR/Images - Product/2 - Mi Querida Images/a - Mi Querida Product Photos/MQ_GORILA_GORDO_SINGLE.png" "mi-querida.jpg"
update_cigar_image "Mi Querida" "name=eq.Mi Querida" "mi-querida.jpg"

# Mi Querida Triqui Traca
upload_image "$SRC_DIR/Images - Product/2 - Mi Querida Images/b - Mi Querida Triqui Traca Product Photos/Mi_Querida_Triqui Traca_Singles_300DPI.png" "mi-querida-triqui-traca.jpg"
update_cigar_image "Mi Querida" "name=ilike.*Triqui*" "mi-querida-triqui-traca.jpg"
update_cigar_image "Dunbarton Tobacco & Trust" "name=ilike.*Triqui*" "mi-querida-triqui-traca.jpg"

echo ""

# 3. TODOS LAS DIAS
echo "📦 Todos Las Dias..."
upload_image "$SRC_DIR/Images - Product/3 - Todos Las Dias Images/Todos_Las_Dias_Singles_300dpi.png" "todos-las-dias.jpg"
update_cigar_image "Todos Las Dias" "name=ilike.*" "todos-las-dias.jpg"
update_cigar_image "Dunbarton Tobacco & Trust" "name=ilike.*Todos*" "todos-las-dias.jpg"

echo ""

# 4. SIN COMPROMISO
echo "📦 Sin Compromiso..."
upload_image "$SRC_DIR/Images - Product/5 - Sin Compromiso Images/Sin_Compromiso_Singles_300dpi_CURRENT_SET.png" "sin-compromiso.jpg"
update_cigar_image "Sin Compromiso" "name=ilike.*" "sin-compromiso.jpg"
update_cigar_image "Dunbarton Tobacco & Trust" "name=ilike.*Sin Compromiso*" "sin-compromiso.jpg"

echo ""

# 5. MUESTRA DE SAKA - Exclusivo
echo "📦 Muestra de Saka..."
upload_image "$SRC_DIR/Images - Product/6 - Muestra de Saka Images/MDS EXCLUSIVO/MDS_EXCLUSIVO_SINGLE_300DPI.png" "muestra-de-saka-exclusivo.jpg"
update_cigar_image "Muestra de Saka" "name=ilike.*Exclusivo*" "muestra-de-saka-exclusivo.jpg"

# Muestra de Saka - Nacatamale
upload_image "$SRC_DIR/Images - Product/6 - Muestra de Saka Images/MDS NACATAMALE/MDS_NACATAMALE_SINGLE_300DPI.png" "muestra-de-saka-nacatamale.jpg"
update_cigar_image "Muestra de Saka" "name=ilike.*Nacatamale*" "muestra-de-saka-nacatamale.jpg"

echo ""

# 6. STILLWELL STAR
echo "📦 StillWell Star..."
upload_image "$SRC_DIR/Images - Product/7 - Stillwell Star Images/STILLWELL_STAR_SINGLES.png" "stillwell-star.jpg"
update_cigar_image "StillWell Star" "name=ilike.*" "stillwell-star.jpg"
update_cigar_image "Dunbarton Tobacco & Trust" "name=ilike.*StillWell*" "stillwell-star.jpg"

echo ""

# 7. RED MEAT LOVERS
echo "📦 Red Meat Lovers..."
upload_image "$SRC_DIR/Images - Product/9 - Red Meat Lovers Images/RML_SINGLES_CURRENT.png" "red-meat-lovers.jpg"
update_cigar_image "Dunbarton Tobacco & Trust" "name=ilike.*Red Meat*" "red-meat-lovers.jpg"

echo ""

# 8. UMBAGOG
echo "📦 Umbagog..."
upload_image "$SRC_DIR/Images - Product/4 - Umbagog Images/UMBAGOG_BRONZEBACK.png" "umbagog.jpg"
# No Umbagog in DB yet but upload image for future use

echo ""

# 9. POLPETTA
echo "📦 Polpetta..."
upload_image "$SRC_DIR/Images - Product/8 - Polpetta Images/POLPETTA_SINGLE.png" "polpetta.jpg"

echo ""

# 10. Also upload some box shots for richer detail views
echo "📦 Bonus: Box shots for detail pages..."
upload_image "$SRC_DIR/Images - Product/1 - Sobremesa Images/d - Sobremesa Brulee Blue Product Photos/Saka_Sobremesa_BruleeBlue_BoxOpened_Left_0821.png" "sobremesa-box.jpg"
upload_image "$SRC_DIR/Images - Product/2 - Mi Querida Images/a - Mi Querida Product Photos/Mi_Querida_Box_Open_To_Left_300DPI.png" "mi-querida-box.jpg"
upload_image "$SRC_DIR/Images - Product/5 - Sin Compromiso Images/Sin_Compromiso_BoxOpened_To_Left_300dpi.png" "sin-compromiso-box.jpg"
upload_image "$SRC_DIR/Images - Product/3 - Todos Las Dias Images/Todos_Las_Dias_Box_Opened_Left_300dpi.png" "todos-las-dias-box.jpg"
upload_image "$SRC_DIR/Images - Product/6 - Muestra de Saka Images/MDS NACATAMALE/MDS_NACATAMALE_BOX_OPEN_LEFT_300dpi.png" "muestra-de-saka-box.jpg"

echo ""

# 11. Upload logos
echo "📦 Brand Logos..."
for logo_dir in "$SRC_DIR/Logos - Company & Brand"/*/; do
  logo_name=$(basename "$logo_dir")
  logo_file=$(find "$logo_dir" -type f \( -name "*.png" -o -name "*.jpg" \) | head -1)
  if [ -n "$logo_file" ]; then
    slug=$(echo "$logo_name" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')
    upload_image "$logo_file" "logo-$slug.jpg"
  fi
done

echo ""
echo "========================================="
echo "✅ All DTT images uploaded and mapped!"
echo "========================================="

# Cleanup
rm -rf "$RESIZED_DIR"
