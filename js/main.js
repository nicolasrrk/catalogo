(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const grid = $("#product-grid");
  const featuredGrid = $("#featured-grid");
  const offersGrid = $("#offers-grid");
  const resultsCount = $("#results-count");
  const dataStatus = $("#data-status");
  const emptyState = $("#empty-state");
  const searchInput = $("#product-search");
  const stockOnly = $("#stock-only");
  const filterRow = $("#category-filters");
  const syncLabel = $("#sync-label");
  const livePill = syncLabel && syncLabel.closest(".live-pill");
  const productDialog = $("#product-dialog");
  const adminDialog = $("#admin-dialog");
  const imageBucket = "product-images";
  const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  const maxImageBytes = 5 * 1024 * 1024;
  const hiddenProductSlugs = new Set(STORE_CONFIG.hiddenProductSlugs || []);
  let products = [];
  let imageRecords = [];
  let merchandisingRecords = [];
  let adminOrder = [];
  let activeAdminScope = "all";
  let adminMerchDirty = false;
  let draggedProductSlug = null;
  let activeCategory = "Todos";
  let visibleLimit = 12;
  let catalogChannel = null;
  let adminRefreshTimer = null;

  const money = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  });

  const supabaseClient = window.supabase && STORE_CONFIG.supabaseUrl && STORE_CONFIG.supabasePublishableKey
    ? window.supabase.createClient(STORE_CONFIG.supabaseUrl, STORE_CONFIG.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
      })
    : null;

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function displayName(value) {
    return String(value || "Producto").toLocaleLowerCase("es-AR").replace(/(^|\s)([a-záéíóúñ])/g, (_, space, letter) => space + letter.toLocaleUpperCase("es-AR"));
  }

  function productImages(product) {
    const remote = imageRecords
      .filter((item) => item.product_slug === product.slug)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      .map((item) => ({ src: item.src, alt: item.alt_text || displayName(product.name) }));
    if (remote.length) return remote;
    const media = PRODUCT_MEDIA.find((item) => normalize(product.name).includes(normalize(item.match)));
    return media ? media.images.map((src) => ({ src, alt: displayName(product.name) })) : [];
  }

  function productDescription(product) {
    return CATEGORY_DESCRIPTIONS[product.category] || "Un producto seleccionado por GenStore para acompañarte todos los días.";
  }

  function hasOffer(product) {
    return Number(product.offer_price) > 0 && Number(product.offer_price) < Number(product.price);
  }

  function sellingPrice(product) {
    return hasOffer(product) ? Number(product.offer_price) : Number(product.price) || 0;
  }

  function placeholderSvgData(product) {
    const isMate = normalize(product.category).includes("mate");
    const shape = isMate
      ? '<path d="M78 84h64l-8 94c-2 22-17 36-38 36s-36-14-38-36l-8-94h28m55 19c19 0 27 10 27 24s-9 24-25 24"/>'
      : '<path d="M74 58h72v28H74zM60 86h100v102c0 18-15 32-32 32H92c-17 0-32-14-32-32V86Zm100 28h12c17 0 28 12 28 29s-11 29-28 29h-12"/>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 260"><rect width="220" height="260" rx="28" fill="#E9E3DA"/><g fill="none" stroke="#9D6846" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${shape}</g><circle cx="184" cy="42" r="18" fill="#C6926D" opacity=".65"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function whatsappFor(product) {
    const message = STORE_CONFIG.productMessage
      .replace("{product}", displayName(product.name))
      .replace("{price}", money.format(sellingPrice(product)));
    return buildWhatsAppLink(message);
  }

  function setConnectionState(text, live) {
    if (syncLabel) syncLabel.textContent = text;
    if (livePill) livePill.classList.toggle("is-live", Boolean(live));
  }

  function renderCategories() {
    const categories = ["Todos", ...new Set(products.map((product) => product.category || "Otros"))];
    filterRow.replaceChildren();
    categories.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-button";
      button.textContent = category;
      button.setAttribute("aria-pressed", String(category === activeCategory));
      button.addEventListener("click", () => {
        activeCategory = category;
        visibleLimit = 12;
        renderCategories();
        renderProducts();
      });
      filterRow.appendChild(button);
    });
  }

  function createCard(product) {
    const article = document.createElement("article");
    article.className = "product-card";

    const mediaButton = document.createElement("button");
    mediaButton.type = "button";
    mediaButton.className = "product-card__media";
    mediaButton.setAttribute("aria-label", `Ver detalles de ${displayName(product.name)}`);
    const image = document.createElement("img");
    const images = productImages(product);
    image.src = images[0]?.src || placeholderSvgData(product);
    image.alt = images.length ? displayName(product.name) : "";
    image.loading = "lazy";
    image.width = 600;
    image.height = 750;
    if (!images.length) image.className = "product-card__fallback";
    mediaButton.appendChild(image);

    const category = document.createElement("span");
    category.className = "product-card__category";
    category.textContent = product.category || "GenStore";
    mediaButton.appendChild(category);

    if (hasOffer(product) || product.is_featured) {
      const promo = document.createElement("span");
      promo.className = `product-card__promo${hasOffer(product) ? " is-offer" : ""}`;
      promo.textContent = hasOffer(product) ? "Oferta" : "Destacado";
      mediaButton.appendChild(promo);
    }

    const stock = document.createElement("span");
    stock.className = "product-card__stock";
    if (product.stock <= 0) {
      stock.classList.add("is-out");
      stock.textContent = "Sin stock";
    } else if (product.stock <= 2) {
      stock.classList.add("is-low");
      stock.textContent = `Últimas ${product.stock}`;
    } else {
      stock.textContent = "Disponible";
    }
    mediaButton.appendChild(stock);
    mediaButton.addEventListener("click", () => openProduct(product));

    const body = document.createElement("div");
    body.className = "product-card__body";
    const title = document.createElement("h3");
    title.className = "product-card__title";
    title.textContent = displayName(product.name);
    const price = document.createElement("p");
    price.className = "product-card__price";
    if (hasOffer(product)) {
      const oldPrice = document.createElement("del");
      oldPrice.textContent = money.format(Number(product.price) || 0);
      const offerPrice = document.createElement("span");
      offerPrice.textContent = money.format(sellingPrice(product));
      price.append(oldPrice, offerPrice);
    } else {
      price.textContent = money.format(Number(product.price) || 0);
    }
    const buy = document.createElement("a");
    buy.className = "button button--whatsapp";
    buy.textContent = product.stock > 0 ? "Comprar por WhatsApp" : "Consultar ingreso";
    buy.href = whatsappFor(product);
    buy.target = "_blank";
    buy.rel = "noopener noreferrer";
    buy.setAttribute("aria-label", `${buy.textContent}: ${displayName(product.name)}`);
    body.append(title, price, buy);
    article.append(mediaButton, body);
    return article;
  }

  function filteredProducts() {
    const query = normalize(searchInput.value);
    return products.filter((product) => {
      const matchesQuery = !query || normalize(`${product.name} ${product.category}`).includes(query);
      const matchesCategory = activeCategory === "Todos" || product.category === activeCategory;
      const matchesStock = !stockOnly.checked || product.stock > 0;
      return matchesQuery && matchesCategory && matchesStock;
    });
  }

  function renderProducts() {
    const visible = filteredProducts();
    const displayed = visible.slice(0, visibleLimit);
    grid.replaceChildren(...displayed.map(createCard));
    grid.setAttribute("aria-busy", "false");
    resultsCount.textContent = visible.length > displayed.length
      ? `${displayed.length} de ${visible.length} productos`
      : `${visible.length} ${visible.length === 1 ? "producto" : "productos"}`;
    $("#load-more").hidden = displayed.length >= visible.length;
    emptyState.hidden = visible.length > 0;
    renderCuratedSections();
  }

  function renderCuratedSections() {
    const featured = products.filter((product) => product.is_featured && product.stock > 0).slice(0, 8);
    const offers = products.filter((product) => hasOffer(product) && product.stock > 0).slice(0, 8);
    const featuredSection = $("#destacados");
    const offersSection = $("#ofertas");
    featuredSection.hidden = featured.length === 0;
    offersSection.hidden = offers.length === 0;
    featuredGrid.replaceChildren(...featured.map(createCard));
    offersGrid.replaceChildren(...offers.map(createCard));
  }

  function mapCatalogRow(row) {
    return {
      slug: String(row.slug || ""),
      name: String(row.name || "Producto"),
      category: String(row.category || "Otros"),
      price: Number(row.price) || 0,
      stock: Math.max(0, Number(row.stock) || 0),
      position: 100000,
      is_featured: false,
      offer_price: null,
      updated_at: row.updated_at || null
    };
  }

  function applyMerchandising() {
    const bySlug = new Map(merchandisingRecords.map((item) => [item.product_slug, item]));
    products.forEach((product) => {
      const item = bySlug.get(product.slug);
      product.position = Number.isInteger(Number(item?.position)) ? Number(item.position) : 100000;
      product.is_featured = Boolean(item?.is_featured);
      product.offer_price = item?.offer_price == null ? null : Number(item.offer_price);
    });
    products.sort((a, b) => a.position - b.position
      || displayName(a.category).localeCompare(displayName(b.category), "es-AR")
      || displayName(a.name).localeCompare(displayName(b.name), "es-AR"));
  }

  async function loadMerchandising() {
    if (!supabaseClient) {
      merchandisingRecords = [];
      return;
    }
    const { data, error } = await supabaseClient
      .from("catalog_product_merchandising")
      .select("product_slug,position,is_featured,offer_price,updated_at")
      .order("position");
    if (error) throw error;
    merchandisingRecords = data || [];
  }

  async function loadCatalogImages() {
    if (!supabaseClient) {
      imageRecords = [];
      return;
    }
    const { data, error } = await supabaseClient
      .from("catalog_product_images")
      .select("id,product_slug,storage_path,position,alt_text,created_at")
      .order("product_slug")
      .order("position")
      .order("created_at");
    if (error) throw error;
    imageRecords = (data || []).map((item) => {
      const { data: publicData } = supabaseClient.storage.from(imageBucket).getPublicUrl(item.storage_path);
      return { ...item, src: publicData.publicUrl };
    });
  }

  async function loadProducts() {
    if (!supabaseClient) {
      products = FALLBACK_PRODUCTS.map(mapCatalogRow).filter((product) => !hiddenProductSlugs.has(product.slug));
      applyMerchandising();
      dataStatus.textContent = "Vista local";
      setConnectionState("Vista local", false);
      renderCategories();
      renderProducts();
      return;
    }
    const [productResult, imageResult, merchandisingResult] = await Promise.all([
      supabaseClient.from("catalog_products").select("slug,name,category,price,stock,updated_at").order("category").order("name"),
      loadCatalogImages().then(() => ({ error: null })).catch((error) => ({ error })),
      loadMerchandising().then(() => ({ error: null })).catch((error) => ({ error }))
    ]);
    const { data, error } = productResult;
    if (error || !data || !data.length) {
      products = FALLBACK_PRODUCTS.map(mapCatalogRow).filter((product) => !hiddenProductSlugs.has(product.slug));
      applyMerchandising();
      dataStatus.textContent = "No se pudo actualizar; mostrando respaldo local";
      setConnectionState("Sin conexión", false);
    } else {
      products = data.map(mapCatalogRow).filter((product) => !hiddenProductSlugs.has(product.slug));
      if (merchandisingResult.error) merchandisingRecords = [];
      applyMerchandising();
      const latest = products.map((item) => item.updated_at).filter(Boolean).sort().at(-1);
      dataStatus.textContent = latest ? `Actualizado ${new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(latest))}` : "Stock conectado";
      if (imageResult.error) dataStatus.textContent += " · Fotos locales";
    }
    if (activeCategory !== "Todos" && !products.some((item) => item.category === activeCategory)) activeCategory = "Todos";
    renderCategories();
    renderProducts();
  }

  function subscribeCatalog() {
    if (!supabaseClient) return;
    catalogChannel = supabaseClient
      .channel("genstore-public-catalog")
      .on("postgres_changes", { event: "*", schema: "public", table: "catalog_products" }, loadProducts)
      .on("postgres_changes", { event: "*", schema: "public", table: "catalog_product_images" }, async () => {
        try {
          await loadCatalogImages();
          renderProducts();
          renderAdminImages();
        } catch (_) {}
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "catalog_product_merchandising" }, async () => {
        try {
          await loadMerchandising();
          applyMerchandising();
          renderProducts();
          if (!adminMerchDirty) renderAdminMerchandising(true);
        } catch (_) {}
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionState("Stock en vivo", true);
        if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) setConnectionState("Actualización manual", false);
      });
  }

  function openProduct(product) {
    const images = productImages(product);
    const dialogImage = $("#dialog-image");
    dialogImage.src = images[0]?.src || placeholderSvgData(product);
    dialogImage.alt = images[0]?.alt || "";
    dialogImage.classList.toggle("is-fallback", !images.length);
    $("#dialog-image-count").textContent = images.length ? `Foto 1 de ${images.length}` : "Foto de referencia";
    $("#dialog-category").textContent = `Catálogo GenStore · ${product.category}`;
    $("#dialog-title").textContent = displayName(product.name);
    $("#dialog-description").textContent = productDescription(product);
    const dialogPrice = $("#dialog-price");
    if (hasOffer(product)) {
      const oldPrice = document.createElement("del");
      oldPrice.textContent = money.format(product.price);
      const offerPrice = document.createElement("span");
      offerPrice.textContent = money.format(sellingPrice(product));
      dialogPrice.replaceChildren(oldPrice, offerPrice);
    } else {
      dialogPrice.textContent = money.format(product.price);
    }
    const stockState = $("#dialog-stock");
    stockState.textContent = product.stock > 0 ? `${product.stock} ${product.stock === 1 ? "unidad disponible" : "unidades disponibles"}` : "Sin stock inmediato. Consultanos por próximo ingreso.";
    stockState.classList.toggle("is-out", product.stock <= 0);
    const buy = $("#dialog-buy");
    buy.href = whatsappFor(product);
    buy.textContent = product.stock > 0 ? "Comprar por WhatsApp" : "Consultar próximo ingreso";

    const thumbs = $("#dialog-thumbs");
    const gallery = productDialog.querySelector(".dialog-gallery");
    const hasMultipleImages = images.length > 1;
    thumbs.hidden = !hasMultipleImages;
    gallery.classList.toggle("has-thumbnails", hasMultipleImages);
    thumbs.replaceChildren();
    images.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dialog-thumb";
      button.setAttribute("aria-label", `Ver foto ${index + 1}`);
      button.setAttribute("aria-current", String(index === 0));
      const thumb = document.createElement("img");
      thumb.src = item.src;
      thumb.alt = "";
      button.appendChild(thumb);
      button.addEventListener("click", () => {
        dialogImage.src = item.src;
        dialogImage.alt = item.alt;
        $("#dialog-image-count").textContent = `Foto ${index + 1} de ${images.length}`;
        thumbs.querySelectorAll("button").forEach((item) => item.setAttribute("aria-current", String(item === button)));
      });
      thumbs.appendChild(button);
    });
    productDialog.showModal();
  }

  function renderSocialLinks() {
    const labels = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
    const container = $("#social-links");
    Object.entries(STORE_CONFIG.socialLinks || {}).forEach(([network, url]) => {
      if (!url) return;
      const link = document.createElement("a");
      link.className = "social-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = labels[network] || network;
      container.appendChild(link);
    });
    if (!container.children.length) container.closest("div").hidden = true;
  }

  function setAdminMerchDirty(dirty, message) {
    adminMerchDirty = dirty;
    const save = $("#admin-merch-save");
    const status = $("#admin-merch-status");
    if (save) save.disabled = !dirty;
    if (status) {
      status.classList.remove("is-success");
      status.textContent = message || (dirty ? "Tenés cambios sin guardar." : "Sin cambios pendientes.");
    }
  }

  function normalizeAdminPositions() {
    adminOrder.forEach((slug, index) => {
      const product = products.find((item) => item.slug === slug);
      if (product) product.position = index * 10;
    });
  }

  function matchesAdminScope(product) {
    if (activeAdminScope === "featured") return product.is_featured;
    if (activeAdminScope === "offers") return product.offer_price != null;
    return true;
  }

  function adminScopeSlugs() {
    return adminOrder.filter((slug) => {
      const product = products.find((item) => item.slug === slug);
      return product && matchesAdminScope(product);
    });
  }

  function setAdminScope(scope) {
    activeAdminScope = ["all", "featured", "offers"].includes(scope) ? scope : "all";
    document.querySelectorAll("[data-admin-scope]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.adminScope === activeAdminScope));
    });
    renderAdminMerchandising();
  }

  function moveAdminProduct(slug, direction) {
    const scopedSlugs = adminScopeSlugs();
    const scopedIndex = scopedSlugs.indexOf(slug);
    const targetSlug = scopedSlugs[scopedIndex + direction];
    const from = adminOrder.indexOf(slug);
    const to = adminOrder.indexOf(targetSlug);
    if (from < 0 || to < 0) return;
    [adminOrder[from], adminOrder[to]] = [adminOrder[to], adminOrder[from]];
    normalizeAdminPositions();
    setAdminMerchDirty(true);
    renderAdminMerchandising();
    const moved = document.querySelector(`[data-admin-product="${CSS.escape(slug)}"]`);
    moved?.focus({ preventScroll: true });
  }

  function dropAdminProduct(sourceSlug, targetSlug) {
    if (!sourceSlug || sourceSlug === targetSlug) return;
    const sourceIndex = adminOrder.indexOf(sourceSlug);
    const targetIndex = adminOrder.indexOf(targetSlug);
    if (sourceIndex < 0 || targetIndex < 0) return;
    [adminOrder[sourceIndex], adminOrder[targetIndex]] = [adminOrder[targetIndex], adminOrder[sourceIndex]];
    normalizeAdminPositions();
    setAdminMerchDirty(true);
    renderAdminMerchandising();
  }

  function renderAdminMerchandising(resetOrder = false) {
    const container = $("#admin-product-order");
    if (!container) return;
    const validSlugs = new Set(products.map((product) => product.slug));
    if (resetOrder || !adminOrder.length) adminOrder = products.map((product) => product.slug);
    else adminOrder = [...adminOrder.filter((slug) => validSlugs.has(slug)), ...products.map((product) => product.slug).filter((slug) => !adminOrder.includes(slug))];

    const query = normalize($("#admin-product-search")?.value);
    const scopedSlugs = adminScopeSlugs();
    const orderedProducts = adminOrder
      .map((slug) => products.find((product) => product.slug === slug))
      .filter(Boolean)
      .filter(matchesAdminScope)
      .filter((product) => !query || normalize(`${product.name} ${product.category}`).includes(query));

    if (!orderedProducts.length) {
      const empty = document.createElement("p");
      empty.className = "admin-image-empty";
      empty.textContent = query
        ? "No encontramos productos con esa búsqueda."
        : activeAdminScope === "featured"
          ? "Todavía no marcaste productos destacados."
          : "Todavía no configuraste productos en oferta.";
      container.replaceChildren(empty);
      return;
    }

    container.replaceChildren(...orderedProducts.map((product) => {
      const row = document.createElement("article");
      row.className = "admin-product-row";
      row.draggable = true;
      row.dataset.adminProduct = product.slug;
      row.tabIndex = -1;

      const order = document.createElement("div");
      order.className = "admin-product-row__order";
      const handle = document.createElement("span");
      handle.className = "admin-drag-handle";
      handle.textContent = "⋮⋮";
      handle.setAttribute("aria-hidden", "true");
      const up = document.createElement("button");
      up.type = "button";
      up.className = "admin-order-button";
      up.textContent = "↑";
      up.setAttribute("aria-label", `Subir ${displayName(product.name)}`);
      up.disabled = scopedSlugs[0] === product.slug;
      up.addEventListener("click", () => moveAdminProduct(product.slug, -1));
      const down = document.createElement("button");
      down.type = "button";
      down.className = "admin-order-button";
      down.textContent = "↓";
      down.setAttribute("aria-label", `Bajar ${displayName(product.name)}`);
      down.disabled = scopedSlugs.at(-1) === product.slug;
      down.addEventListener("click", () => moveAdminProduct(product.slug, 1));
      order.append(handle, up, down);

      const identity = document.createElement("div");
      identity.className = "admin-product-row__identity";
      const name = document.createElement("strong");
      name.textContent = displayName(product.name);
      const category = document.createElement("small");
      category.textContent = `${product.category} · ${money.format(product.price)}`;
      identity.append(name, category);

      const featuredLabel = document.createElement("label");
      featuredLabel.className = "admin-check";
      const featured = document.createElement("input");
      featured.type = "checkbox";
      featured.checked = product.is_featured;
      featured.addEventListener("change", () => {
        product.is_featured = featured.checked;
        setAdminMerchDirty(true);
        if (activeAdminScope === "featured") renderAdminMerchandising();
      });
      featuredLabel.append(featured, document.createTextNode(" Destacado"));

      const offer = document.createElement("div");
      offer.className = "admin-offer-control";
      const offerLabel = document.createElement("label");
      offerLabel.className = "admin-check";
      const offerToggle = document.createElement("input");
      offerToggle.type = "checkbox";
      offerToggle.checked = product.offer_price != null;
      offerLabel.append(offerToggle, document.createTextNode(" Oferta"));
      const offerPrice = document.createElement("input");
      offerPrice.type = "number";
      offerPrice.min = "1";
      offerPrice.max = String(Math.max(1, Math.floor(product.price - 1)));
      offerPrice.step = "1";
      offerPrice.placeholder = "Precio oferta";
      offerPrice.setAttribute("aria-label", `Precio de oferta de ${displayName(product.name)}`);
      offerPrice.value = hasOffer(product) ? String(product.offer_price) : "";
      offerPrice.disabled = !offerToggle.checked;
      offerToggle.addEventListener("change", () => {
        offerPrice.disabled = !offerToggle.checked;
        product.offer_price = offerToggle.checked ? (offerPrice.value ? Number(offerPrice.value) : 0) : null;
        setAdminMerchDirty(true);
        if (offerToggle.checked) offerPrice.focus();
        if (!offerToggle.checked && activeAdminScope === "offers") renderAdminMerchandising();
      });
      offerPrice.addEventListener("input", () => {
        product.offer_price = offerPrice.value ? Number(offerPrice.value) : 0;
        setAdminMerchDirty(true);
      });
      offer.append(offerLabel, offerPrice);

      row.addEventListener("dragstart", () => {
        draggedProductSlug = product.slug;
        row.classList.add("is-dragging");
      });
      row.addEventListener("dragend", () => {
        draggedProductSlug = null;
        row.classList.remove("is-dragging");
      });
      row.addEventListener("dragover", (event) => event.preventDefault());
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        dropAdminProduct(draggedProductSlug, product.slug);
      });
      row.append(order, identity, featuredLabel, offer);
      return row;
    }));
  }

  async function saveAdminMerchandising() {
    const save = $("#admin-merch-save");
    const invalidOffer = products.find((product) => product.offer_price != null && !hasOffer(product));
    if (invalidOffer) {
      setAdminMerchDirty(true, `La oferta de ${displayName(invalidOffer.name)} debe ser mayor a $0 y menor al precio normal.`);
      return;
    }
    normalizeAdminPositions();
    const updatedAt = new Date().toISOString();
    const payload = adminOrder.map((slug, index) => {
      const product = products.find((item) => item.slug === slug);
      return {
        product_slug: slug,
        position: index * 10,
        is_featured: Boolean(product?.is_featured),
        offer_price: product?.offer_price == null ? null : Number(product.offer_price),
        updated_at: updatedAt
      };
    });
    save.disabled = true;
    save.textContent = "Guardando…";
    try {
      const { data, error } = await supabaseClient
        .from("catalog_product_merchandising")
        .upsert(payload, { onConflict: "product_slug" })
        .select("product_slug,position,is_featured,offer_price,updated_at");
      if (error) throw error;
      merchandisingRecords = data || payload;
      applyMerchandising();
      adminOrder = products.map((product) => product.slug);
      setAdminMerchDirty(false);
      $("#admin-merch-status").classList.add("is-success");
      $("#admin-merch-status").textContent = "Orden y promociones publicados.";
      renderProducts();
      renderAdminMerchandising();
    } catch (_) {
      setAdminMerchDirty(true, "No se pudieron guardar los cambios. Revisá la sesión e intentá nuevamente.");
    } finally {
      save.textContent = "Guardar cambios";
      save.disabled = !adminMerchDirty;
    }
  }

  function renderAdminProductOptions() {
    const select = $("#admin-image-product");
    if (!select) return;
    const previousValue = select.value;
    const sorted = [...products].sort((a, b) => displayName(a.name).localeCompare(displayName(b.name), "es-AR"));
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Elegí un producto";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.replaceChildren(placeholder, ...sorted.map((product) => {
      const option = document.createElement("option");
      option.value = product.slug;
      option.textContent = displayName(product.name);
      return option;
    }));
    if (sorted.some((product) => product.slug === previousValue)) select.value = previousValue;
    else if (sorted.length) select.value = sorted[0].slug;
    renderAdminImages();
  }

  function renderAdminImages() {
    const select = $("#admin-image-product");
    const list = $("#admin-image-list");
    const count = $("#admin-image-count");
    if (!select || !list || !count) return;
    const selected = imageRecords
      .filter((item) => item.product_slug === select.value)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    count.textContent = String(selected.length);
    if (!selected.length) {
      const empty = document.createElement("p");
      empty.className = "admin-image-empty";
      empty.textContent = "Este producto todavía no tiene fotos publicadas.";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...selected.map((item, index) => {
      const figure = document.createElement("figure");
      figure.className = "admin-image-item";
      const image = document.createElement("img");
      image.src = item.src;
      image.alt = item.alt_text || "";
      image.loading = "lazy";
      image.width = 240;
      image.height = 300;
      const label = document.createElement("span");
      label.textContent = index === 0 ? "Portada" : `Foto ${index + 1}`;
      figure.append(image, label);
      return figure;
    }));
  }

  function updateAdminFileSummary() {
    const input = $("#admin-image-files");
    const summary = $("#admin-file-summary");
    const files = Array.from(input.files || []);
    summary.textContent = files.length
      ? `${files.length} ${files.length === 1 ? "imagen seleccionada" : "imágenes seleccionadas"}.`
      : "Todavía no seleccionaste archivos.";
  }

  function imageExtension(file) {
    return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[file.type] || "jpg";
  }

  async function handleImageUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $("#admin-image-submit");
    const status = $("#admin-image-status");
    const select = $("#admin-image-product");
    const input = $("#admin-image-files");
    const files = Array.from(input.files || []);
    status.classList.remove("is-success");
    status.textContent = "";

    if (!form.reportValidity()) return;
    if (!files.length || files.length > 8) {
      status.textContent = "Seleccioná entre 1 y 8 imágenes.";
      return;
    }
    const invalidFile = files.find((file) => !allowedImageTypes.has(file.type) || file.size > maxImageBytes);
    if (invalidFile) {
      status.textContent = `“${invalidFile.name}” no cumple el formato permitido o supera 5 MB.`;
      return;
    }
    const product = products.find((item) => item.slug === select.value);
    if (!product) {
      status.textContent = "Elegí un producto válido.";
      return;
    }

    submit.disabled = true;
    submit.textContent = "Subiendo 0%";
    let uploaded = 0;
    try {
      const { data: userData, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !userData.user) throw userError || new Error("Sesión no disponible");
      const current = imageRecords.filter((item) => item.product_slug === product.slug);
      const firstPosition = current.length ? Math.max(...current.map((item) => item.position)) + 1 : 0;
      const folder = product.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "producto";

      for (const [index, file] of files.entries()) {
        const storagePath = `${folder}/${crypto.randomUUID()}.${imageExtension(file)}`;
        const { error: uploadError } = await supabaseClient.storage.from(imageBucket).upload(storagePath, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false
        });
        if (uploadError) throw uploadError;
        const { error: insertError } = await supabaseClient.from("catalog_product_images").insert({
          product_slug: product.slug,
          storage_path: storagePath,
          position: firstPosition + index,
          alt_text: `${displayName(product.name)} - foto ${firstPosition + index + 1}`,
          created_by: userData.user.id
        });
        if (insertError) {
          await supabaseClient.storage.from(imageBucket).remove([storagePath]);
          throw insertError;
        }
        uploaded += 1;
        submit.textContent = `Subiendo ${Math.round((uploaded / files.length) * 100)}%`;
      }

      await loadCatalogImages();
      renderProducts();
      renderAdminImages();
      form.reset();
      select.value = product.slug;
      updateAdminFileSummary();
      status.classList.add("is-success");
      status.textContent = `${uploaded} ${uploaded === 1 ? "imagen publicada" : "imágenes publicadas"} correctamente.`;
    } catch (_) {
      try {
        await loadCatalogImages();
        renderProducts();
        renderAdminImages();
      } catch (_) {}
      status.textContent = uploaded
        ? `Se publicaron ${uploaded} de ${files.length} imágenes. Volvé a intentar con las restantes.`
        : "No se pudieron publicar las imágenes. Revisá la sesión e intentá nuevamente.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Agregar imágenes";
    }
  }

  function openAdmin() {
    adminDialog.showModal();
    setTimeout(() => $("#admin-email").focus(), 20);
  }

  async function refreshAdminDashboard() {
    const { data, error } = await supabaseClient.from("erp_data").select("stock,updated_at").single();
    if (error || !data) throw error || new Error("No data");
    const stock = Array.isArray(data.stock) ? data.stock : [];
    const units = stock.reduce((total, item) => total + (Number(item.stockActual) || 0), 0);
    const noStock = stock.filter((item) => (Number(item.stockActual) || 0) <= 0).length;
    const metrics = [
      [stock.length, "Productos en ERP"],
      [units, "Unidades totales"],
      [noStock, "Sin stock"],
      [stock.filter((item) => (Number(item.stockActual) || 0) <= 2 && (Number(item.stockActual) || 0) > 0).length, "Stock bajo"]
    ];
    const container = $("#admin-metrics");
    container.replaceChildren(...metrics.map(([value, label]) => {
      const item = document.createElement("div");
      item.className = "admin-metric";
      const strong = document.createElement("strong");
      strong.textContent = value;
      const span = document.createElement("span");
      span.textContent = label;
      item.append(strong, span);
      return item;
    }));
    $("#admin-updated").textContent = `Última actualización del ERP: ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.updated_at))}`;
  }

  async function showAdminDashboard() {
    await refreshAdminDashboard();
    $("#admin-login").hidden = true;
    $("#admin-dashboard").hidden = false;
    setAdminScope("all");
    setAdminMerchDirty(false);
    renderAdminMerchandising(true);
    renderAdminProductOptions();
    $("#admin-product-search").focus();
    if (adminRefreshTimer) window.clearInterval(adminRefreshTimer);
    adminRefreshTimer = window.setInterval(() => refreshAdminDashboard().catch(() => {}), 30000);
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = $("#admin-submit");
    const errorBox = $("#admin-error");
    if (!form.reportValidity()) return;
    submit.disabled = true;
    submit.textContent = "Verificando…";
    errorBox.textContent = "";
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    try {
      if (!supabaseClient) throw new Error("Supabase no disponible");
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      form.elements.password.value = "";
      if (error) throw error;
      await showAdminDashboard();
    } catch (_) {
      errorBox.textContent = "No pudimos validar el acceso. Revisá los datos o intentá más tarde.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Ingresar";
    }
  }

  async function handleAdminLogout() {
    if (supabaseClient) await supabaseClient.auth.signOut({ scope: "local" });
    if (adminRefreshTimer) window.clearInterval(adminRefreshTimer);
    adminRefreshTimer = null;
    $("#admin-dashboard").hidden = true;
    $("#admin-login").hidden = false;
    $("#admin-form").reset();
    $("#admin-image-form").reset();
    $("#admin-image-status").textContent = "";
    $("#admin-product-search").value = "";
    setAdminScope("all");
    setAdminMerchDirty(false);
    updateAdminFileSummary();
    $("#admin-email").focus();
  }

  function bindStaticUi() {
    $("#year").textContent = new Date().getFullYear();
    const genericLink = buildWhatsAppLink(STORE_CONFIG.genericMessage);
    $("#hero-whatsapp").href = genericLink;
    $("#whatsapp-floating").href = genericLink;
    $("#closing-whatsapp").href = buildWhatsAppLink(STORE_CONFIG.recommendationMessage);
    searchInput.addEventListener("input", () => { visibleLimit = 12; renderProducts(); });
    stockOnly.addEventListener("change", () => { visibleLimit = 12; renderProducts(); });
    $("#load-more").addEventListener("click", () => { visibleLimit += 12; renderProducts(); });
    $("#clear-filters").addEventListener("click", () => { searchInput.value = ""; stockOnly.checked = false; activeCategory = "Todos"; visibleLimit = 12; renderCategories(); renderProducts(); });
    $("[data-close-dialog]").addEventListener("click", () => productDialog.close());
    $("[data-close-admin]").addEventListener("click", () => adminDialog.close());
    [$("#open-admin"), $("#open-admin-footer")].forEach((button) => button.addEventListener("click", openAdmin));
    $("#admin-form").addEventListener("submit", handleAdminLogin);
    $("#admin-image-form").addEventListener("submit", handleImageUpload);
    $("#admin-image-product").addEventListener("change", renderAdminImages);
    $("#admin-image-files").addEventListener("change", updateAdminFileSummary);
    $("#admin-product-search").addEventListener("input", () => renderAdminMerchandising());
    document.querySelectorAll("[data-admin-scope]").forEach((button) => {
      button.addEventListener("click", () => setAdminScope(button.dataset.adminScope));
    });
    $("#admin-merch-save").addEventListener("click", saveAdminMerchandising);
    $("#admin-logout").addEventListener("click", handleAdminLogout);
    [productDialog, adminDialog].forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
    adminDialog.addEventListener("close", () => {
      if (!adminMerchDirty) return;
      applyMerchandising();
      adminOrder = products.map((product) => product.slug);
      setAdminMerchDirty(false);
      renderProducts();
    });
    renderSocialLinks();
  }

  bindStaticUi();
  loadProducts().then(subscribeCatalog);

  window.addEventListener("pagehide", () => {
    if (supabaseClient && catalogChannel) supabaseClient.removeChannel(catalogChannel);
    if (adminRefreshTimer) window.clearInterval(adminRefreshTimer);
  });
})();
