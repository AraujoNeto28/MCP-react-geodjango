(function() {
    function initWithJQuery($) {

    function parseJsonSafe(text, fallback) {
        try {
            if (text == null) return fallback;
            const t = String(text).trim();
            if (!t) return fallback;
            return JSON.parse(t);
        } catch (_e) {
            return fallback;
        }
    }

    function toHexColor(v, fallback) {
        if (typeof v !== 'string') return fallback;
        const s = v.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
        return fallback;
    }

    function toNumber(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    async function fetchJson(url) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    // --- RootGroup Admin: Workspace Selector ---
    const workspaceInput = $('#id_workspace');
    if (workspaceInput.length && $('#rootgroup_form').length) {
        const currentVal = workspaceInput.val();
        const select = $('<select id="id_workspace_select" style="width: 300px; padding: 5px;"><option value="">Loading workspaces...</option></select>');
        workspaceInput.hide().after(select);

        select.on('change', function() {
            workspaceInput.val(this.value);
        });

        fetchJson('/api/geoserver/workspaces/')
            .then(data => {
                select.empty().append('<option value="">-- Select Workspace --</option>');
                (data.workspaces || []).forEach(ws => {
                    const selected = ws === currentVal ? 'selected' : '';
                    select.append(`<option value="${ws}" ${selected}>${ws}</option>`);
                });
                if (currentVal && !(data.workspaces || []).includes(currentVal)) {
                    select.append(`<option value="${currentVal}" selected>${currentVal}</option>`);
                }
            })
            .catch(err => {
                console.error(err);
                select.html('<option value="">Error loading workspaces</option>');
                workspaceInput.show();
            });
    }

    // --- Layer Admin: Layer Selector & Attributes ---
    const layerNameInput = $('#id_layer_name');
    const rootGroupSelect = $('#id_root_group');
    const workspaceInputLayer = $('#id_workspace');
    const serviceTypeInputLayer = $('#id_service_type');
    const nativeCrsInputLayer = $('#id_native_crs');
    let lastBboxKey = null;
    
    if (layerNameInput.length && rootGroupSelect.length) {
        fetchJson('/api/layers/root-groups/').then(rgs => {
            const rgMap = {};
            rgs.forEach(r => rgMap[r.id] = r);

            const currentLayerVal = layerNameInput.val();
            const layerSelect = $('<select id="id_layer_name_select" style="width: 300px; padding: 5px;"><option value="">---</option></select>');
            layerNameInput.hide().after(layerSelect);
            
            layerSelect.on('change', function() {
                layerNameInput.val(this.value);
                const rgId = rootGroupSelect.val();
                const rg = rgMap[rgId];
                if (rg && this.value) {
                    loadAttributes(rg.workspace, this.value);
                    loadNativeCrs(rg.workspace, this.value);
                    loadBboxPreview(rg.workspace, this.value);
                }
            });

            async function updateLayers(rgId) {
                const rg = rgMap[rgId];
                if (!rg) {
                    layerSelect.empty().append('<option value="">Select Root Group first</option>');
                    return;
                }

                // Auto-fill workspace and service type
                if (workspaceInputLayer.length) workspaceInputLayer.val(rg.workspace);
                if (serviceTypeInputLayer.length) serviceTypeInputLayer.val(rg.serviceType);
                
                layerSelect.empty().append('<option value="">Loading layers...</option>');
                
                try {
                    const data = await fetchJson(`/api/geoserver/workspaces/${rg.workspace}/layers/?service_type=${rg.serviceType}`);
                    layerSelect.empty().append('<option value="">-- Select Layer --</option>');
                    
                    let found = false;
                    (data.layers || []).forEach(l => {
                        const selected = l.name === currentLayerVal ? 'selected' : '';
                        if (selected) found = true;
                        layerSelect.append(`<option value="${l.name}" ${selected}>${l.name}</option>`);
                    });
                    
                    if (currentLayerVal && !found) {
                         layerSelect.append(`<option value="${currentLayerVal}" selected>${currentLayerVal} (Not found in GeoServer)</option>`);
                    }

                    if (currentLayerVal) {
                         loadAttributes(rg.workspace, currentLayerVal);
                         loadNativeCrs(rg.workspace, currentLayerVal);
                         loadBboxPreview(rg.workspace, currentLayerVal);
                    }
                } catch (e) {
                    console.error(e);
                    layerSelect.html('<option value="">Error loading layers</option>');
                }
            }

            rootGroupSelect.on('change', function() {
                updateLayers(this.value);
            });

            if (rootGroupSelect.val()) {
                updateLayers(rootGroupSelect.val());
            }
        });
    }

    function loadNativeCrs(workspace, layerName) {
        if (!nativeCrsInputLayer.length) return;
        if (!workspace || !layerName) return;

        // Don't overwrite a manually set value.
        const cur = String(nativeCrsInputLayer.val() || '').trim();
        if (cur) return;

        fetchJson(`/api/geoserver/workspaces/${workspace}/layers/${layerName}/native-crs/`)
            .then(data => {
                const crs = (data && data.nativeCrs) ? String(data.nativeCrs).trim() : '';
                if (crs) nativeCrsInputLayer.val(crs);
            })
            .catch(err => {
                // Silent: CRS is optional.
                console.debug('Failed to load native CRS', err);
            });
    }

    function loadBboxPreview(workspace, layerName) {
        if (!workspace || !layerName) return;

        const key = `${workspace}:${layerName}`;
        if (key === lastBboxKey) return;
        lastBboxKey = key;

        const containerId = 'geoserver_bbox_preview';
        $(`#${containerId}`).remove();

        const container = $(`
            <div id="${containerId}" style="margin: 10px 0; padding: 10px; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px; max-width: 820px;">
                <h3 style="margin-top: 0; color: #2d3748; font-size: 14px;">BBox / Preview (Mapa)</h3>
                <div id="gs_bbox_text" style="font-size: 12px; color: #4a5568; margin-bottom: 8px;">Carregando bbox…</div>
                <div style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;">
                    <div id="gs_bbox_map" style="width: 420px; height: 260px; border: 1px solid #cbd5e0; background: white;"></div>
                    <div style="font-size: 12px; color: #4a5568; min-width: 240px;">
                        <div style="margin-bottom: 6px;"><b>Dica:</b> você pode mover/zoomar o mapa livremente.</div>
                    </div>
                </div>
            </div>
        `);

        // Insert near the queryable fields area if present
        const anchor = $('.field-layer_name').closest('fieldset');
        if (anchor.length) anchor.after(container);
        else $('form').prepend(container);

        fetchJson(`/api/geoserver/workspaces/${workspace}/layers/${layerName}/bbox/`)
            .then(data => {
                const b = (data && data.bboxes) ? data.bboxes : {};
                const latLon = b.latLon;
                const nativeB = b.native;

                const fmt = (x) => (typeof x === 'number' ? x.toFixed(6) : String(x));
                const lines = [];
                if (nativeB && Array.isArray(nativeB.extent)) {
                    lines.push(`Native (${nativeB.crs || ''}): [${nativeB.extent.map(fmt).join(', ')}]`);
                }
                if (latLon && Array.isArray(latLon.extent)) {
                    lines.push(`LatLon (${latLon.crs || 'EPSG:4326'}): [${latLon.extent.map(fmt).join(', ')}]`);
                }
                $('#gs_bbox_text').text(lines.length ? lines.join(' | ') : 'BBox não disponível via GeoServer REST.');

                if (!latLon || !Array.isArray(latLon.extent)) {
                    return;
                }

                // Interactive map preview (OSM + bbox footprint).
                // Requires OpenLayers loaded in admin (window.ol).
                if (!window.ol) {
                    $('#gs_bbox_text').text('OpenLayers não carregou no admin (verifique acesso ao CDN).');
                    return;
                }

                const ol = window.ol;
                const bbox = latLon.extent;

                // Create map once and reuse
                if (!window.__gsBboxMap) {
                    const vectorSource = new ol.source.Vector({ wrapX: false });
                    const vectorLayer = new ol.layer.Vector({
                        source: vectorSource,
                        style: new ol.style.Style({
                            stroke: new ol.style.Stroke({ color: 'rgba(220, 38, 38, 1)', width: 3 }),
                            fill: new ol.style.Fill({ color: 'rgba(220, 38, 38, 0.08)' })
                        })
                    });

                    const map = new ol.Map({
                        target: 'gs_bbox_map',
                        layers: [
                            new ol.layer.Tile({ source: new ol.source.OSM() }),
                            vectorLayer
                        ],
                        view: new ol.View({
                            projection: 'EPSG:3857',
                            center: ol.proj.fromLonLat([-51.2177, -30.0346]),
                            zoom: 12
                        })
                    });

                    window.__gsBboxMap = { map, vectorSource };
                } else {
                    // Move target to the new container if needed
                    try {
                        window.__gsBboxMap.map.setTarget('gs_bbox_map');
                    } catch (_e) {}
                }

                const { map, vectorSource } = window.__gsBboxMap;
                vectorSource.clear(true);

                // bbox in EPSG:4326 -> polygon -> transform to EPSG:3857
                const extent4326 = [bbox[0], bbox[1], bbox[2], bbox[3]];
                const poly = ol.geom.Polygon.fromExtent(extent4326);
                poly.transform('EPSG:4326', 'EPSG:3857');

                const feat = new ol.Feature({ geometry: poly });
                vectorSource.addFeature(feat);

                // Fit view to bbox
                try {
                    map.updateSize();
                    map.getView().fit(poly.getExtent(), { padding: [20, 20, 20, 20], duration: 200, maxZoom: 19 });
                } catch (_e) {}
            })
            .catch(err => {
                console.debug('Failed to load bbox preview', err);
                $('#gs_bbox_text').text('Falha ao carregar bbox/preview.');
            });
    }

    function loadAttributes(workspace, layerName) {
        if (!workspace || !layerName) return;
        
        const containerId = 'geoserver_attributes_helper';
        $(`#${containerId}`).remove();
        
        const container = $(`
            <div id="${containerId}" style="margin: 10px 0; padding: 10px; background: #f0f7ff; border: 1px solid #cce5ff; border-radius: 4px; max-width: 800px;">
                <h3 style="margin-top: 0; color: #0056b3; font-size: 14px;">Available Fields for ${layerName}</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 5px; background: white; font-size: 12px;">
                    <thead>
                        <tr style="background: #e9ecef; text-align: left;">
                            <th style="padding: 4px; border: 1px solid #dee2e6;">Campo (Name)</th>
                            <th style="padding: 4px; border: 1px solid #dee2e6;">Label (Como deve ficar)</th>
                            <th style="padding: 4px; border: 1px solid #dee2e6; text-align: center;">Queryable</th>
                            <th style="padding: 4px; border: 1px solid #dee2e6; text-align: center;">Table</th>
                            <th style="padding: 4px; border: 1px solid #dee2e6; text-align: center;">Popup Title</th>
                            <th style="padding: 4px; border: 1px solid #dee2e6; text-align: center;">Popup Body</th>
                        </tr>
                    </thead>
                    <tbody id="gs_fields_tbody">
                        <tr><td colspan="6" style="padding: 10px; text-align: center;">Loading attributes...</td></tr>
                    </tbody>
                </table>
            </div>
        `);
        
        // Insert before the first fieldset or relevant field
        $('.field-queryable_fields').closest('fieldset').before(container);

        // Parse existing JSON values
        let queryableFields = [];
        let tableFields = [];
        let popupTemplate = null;

        try { queryableFields = JSON.parse($('#id_queryable_fields').val() || '[]'); } catch(e) {}
        try { tableFields = JSON.parse($('#id_table_fields').val() || '[]'); } catch(e) {}
        try { popupTemplate = JSON.parse($('#id_popup_template').val() || 'null'); } catch(e) {}

        // Helper to find config for a field
        const getFieldConfig = (fieldName) => {
            const q = queryableFields.find(f => (f.name || f) === fieldName);
            const t = tableFields.find(f => (f.name || f) === fieldName);
            
            // Popup logic
            let isPopupBody = true; // Default to true as requested
            let isPopupTitle = false;

            if (popupTemplate) {
                // Check body/fields
                const pBody = popupTemplate.body || popupTemplate.fields;
                if (Array.isArray(pBody)) {
                     isPopupBody = !!pBody.find(f => (f.field || f.name) === fieldName);
                } else {
                    // If template exists but body is missing, maybe it's a legacy format or empty. 
                    // But user wants default true. If we are editing an existing one, we should probably respect what's there?
                    // User said "entao ja deve vim marcado por padrao". I'll stick to: if template is null, true. If template exists, follow it.
                    // But here popupTemplate is NOT null.
                    isPopupBody = false; 
                }

                // Check title
                if (popupTemplate.title && typeof popupTemplate.title === 'string') {
                    isPopupTitle = popupTemplate.title.includes(`{${fieldName}}`);
                }
            } else {
                // No template, default state
                isPopupBody = true;
                isPopupTitle = false;
            }
            
            // Find label
            let pLabel = null;
            if (popupTemplate) {
                 const pBody = popupTemplate.body || popupTemplate.fields;
                 if (Array.isArray(pBody)) {
                    const pField = pBody.find(f => (f.field || f.name) === fieldName);
                    if (pField) pLabel = pField.label;
                 }
            }

            let label = pLabel || t?.label || q?.label || (fieldName.charAt(0).toUpperCase() + fieldName.slice(1));
            
            return {
                label: label,
                isQueryable: !!q,
                isTable: !!t,
                isPopupBody: isPopupBody,
                isPopupTitle: isPopupTitle
            };
        };
        
        fetchJson(`/api/geoserver/workspaces/${workspace}/layers/${layerName}/attributes/`)
            .then(data => {
                const tbody = $('#gs_fields_tbody');
                tbody.empty();
                
                if (!data.attributes || data.attributes.length === 0) {
                    tbody.html('<tr><td colspan="6" style="padding: 10px; text-align: center;">No attributes found.</td></tr>');
                    return;
                }

                (data.attributes || []).forEach(attr => {
                    const config = getFieldConfig(attr.name);
                    const row = $(`
                        <tr data-field="${attr.name}" data-type="${attr.type}">
                            <td style="padding: 4px; border: 1px solid #dee2e6; font-family: monospace; font-weight: bold;">${attr.name}</td>
                            <td style="padding: 4px; border: 1px solid #dee2e6;">
                                <input type="text" class="field-label-input" value="${config.label}" style="width: 100%; box-sizing: border-box; padding: 2px;">
                            </td>
                            <td style="padding: 4px; border: 1px solid #dee2e6; text-align: center;">
                                <input type="checkbox" class="field-check-queryable" ${config.isQueryable ? 'checked' : ''}>
                            </td>
                            <td style="padding: 4px; border: 1px solid #dee2e6; text-align: center;">
                                <input type="checkbox" class="field-check-table" ${config.isTable ? 'checked' : ''}>
                            </td>
                            <td style="padding: 4px; border: 1px solid #dee2e6; text-align: center;">
                                <input type="checkbox" class="field-check-popup-title" ${config.isPopupTitle ? 'checked' : ''}>
                            </td>
                            <td style="padding: 4px; border: 1px solid #dee2e6; text-align: center;">
                                <input type="checkbox" class="field-check-popup-body" ${config.isPopupBody ? 'checked' : ''}>
                            </td>
                        </tr>
                    `);
                    tbody.append(row);
                });

                // Notify other helpers (e.g., style builder) that attributes are available.
                $(document).trigger('gs:attributesLoaded', [layerName, (data.attributes || [])]);

                // Bind events to update JSON
                tbody.on('change', 'input', updateJsonFields);

                // Trigger initial update if popup template is empty to set defaults
                if (!popupTemplate) {
                    updateJsonFields();
                }
            })
            .catch(e => {
                $('#gs_fields_tbody').html(`<tr><td colspan="6" style="padding: 10px; text-align: center; color: red;">Error: ${e.message}</td></tr>`);
            });

        function updateJsonFields() {
            const newQueryable = [];
            const newTable = [];
            const newPopupBody = [];
            const titleFields = [];

            $('#gs_fields_tbody tr').each(function() {
                const row = $(this);
                const name = row.data('field');
                const label = row.find('.field-label-input').val();
                
                if (row.find('.field-check-queryable').is(':checked')) {
                    newQueryable.push({ name, label });
                }
                if (row.find('.field-check-table').is(':checked')) {
                    newTable.push({ name, label });
                }
                if (row.find('.field-check-popup-title').is(':checked')) {
                    titleFields.push(`{${name}}`);
                }
                if (row.find('.field-check-popup-body').is(':checked')) {
                    newPopupBody.push({ field: name, label });
                }
            });

            $('#id_queryable_fields').val(JSON.stringify(newQueryable));
            $('#id_table_fields').val(JSON.stringify(newTable));
            
            const newPopup = {
                title: titleFields.join(','),
                fields: newPopupBody
            };
            
            $('#id_popup_template').val(JSON.stringify(newPopup));
        }
    }

    // --- Layer Admin: Style Config Builder ---
    (function initStyleConfigBuilder() {
        const styleTextarea = $('#id_style_config');
        const geomSelect = $('#id_geometry_type');
        if (!styleTextarea.length || !geomSelect.length) return;

        const containerId = 'geoserver_style_config_helper';
        if ($(`#${containerId}`).length) return;

        const defaultByGeom = (geomType) => {
            const type = geomType === 'Point' ? 'Point' : (geomType === 'LineString' ? 'LineString' : 'Polygon');
            if (type === 'Point') {
                return {
                    type: 'Point',
                    radius: 8,
                    fillColor: '#e69800',
                    strokeColor: '#000000',
                    strokeWidth: 0.5,
                };
            }
            if (type === 'LineString') {
                return {
                    type: 'LineString',
                    strokeColor: '#000000',
                    strokeWidth: 1,
                    fillColor: 'rgba(0,0,0,0)',
                };
            }
            return {
                type: 'Polygon',
                fillColor: 'rgba(255,255,255,0.4)',
                strokeColor: '#000000',
                strokeWidth: 1,
            };
        };

        const container = $(
            `<div id="${containerId}" style="margin: 0; padding: 10px; background: #f0f7ff; border: 1px solid #cce5ff; border-radius: 4px; width: 100%; box-sizing: border-box;">
                <h3 style="margin-top: 0; color: #0056b3; font-size: 14px;">Style config</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 5px; background: white; font-size: 12px;">
                    <tbody>
                        <tr>
                            <td style="padding: 6px; border: 1px solid #dee2e6; width: 180px;"><b>Type</b> (automático)</td>
                            <td style="padding: 6px; border: 1px solid #dee2e6;"><span id="gs_style_type_value" style="font-family: monospace;"></span></td>
                        </tr>
                        <tr>
                            <td style="padding: 6px; border: 1px solid #dee2e6;"><b>Fill</b></td>
                            <td style="padding: 6px; border: 1px solid #dee2e6;">
                                <input type="color" id="gs_style_fill" />
                                <input type="text" id="gs_style_fill_text" style="width: 120px; margin-left: 8px;" />
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 6px; border: 1px solid #dee2e6;"><b>Stroke</b></td>
                            <td style="padding: 6px; border: 1px solid #dee2e6;">
                                <input type="color" id="gs_style_stroke" />
                                <input type="text" id="gs_style_stroke_text" style="width: 120px; margin-left: 8px;" />
                                <span style="margin-left: 10px;">Width</span>
                                <input type="number" id="gs_style_stroke_width" step="0.1" style="width: 80px; margin-left: 6px;" />
                            </td>
                        </tr>
                        <tr id="gs_style_point_row">
                            <td style="padding: 6px; border: 1px solid #dee2e6;"><b>Point</b></td>
                            <td style="padding: 6px; border: 1px solid #dee2e6;">
                                <span>Radius</span>
                                <input type="number" id="gs_style_radius" step="1" style="width: 80px; margin-left: 6px;" />
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 6px; border: 1px solid #dee2e6;"><b>Label</b></td>
                            <td style="padding: 6px; border: 1px solid #dee2e6;">
                                <label style="margin-right: 10px;"><input type="checkbox" id="gs_label_enabled" /> habilitar</label>
                                <span style="margin-right: 6px;">Campo</span>
                                <select id="gs_label_field" style="min-width: 220px;"><option value="">-- selecione --</option></select>
                            </td>
                        </tr>
                        <tr id="gs_label_opts_row">
                            <td style="padding: 6px; border: 1px solid #dee2e6;"><b>Label options</b></td>
                            <td style="padding: 6px; border: 1px solid #dee2e6;">
                                <span>Font</span>
                                <select id="gs_label_font" style="min-width: 220px; margin-left: 6px;">
                                    <option value="11px Noto Sans Regular">11px Noto Sans Regular</option>
                                    <option value="12px sans-serif">12px sans-serif</option>
                                    <option value="13px sans-serif">13px sans-serif</option>
                                </select>
                                <span style="margin-left: 10px;">Color</span>
                                <input type="color" id="gs_label_color" style="margin-left: 6px;" />
                                <span style="margin-left: 10px;">OffsetY</span>
                                <input type="number" id="gs_label_offsety" step="1" style="width: 80px; margin-left: 6px;" />
                                <br />
                                <span>Halo</span>
                                <input type="color" id="gs_label_halo" style="margin-left: 12px;" />
                                <span style="margin-left: 10px;">Width</span>
                                <input type="number" id="gs_label_halowidth" step="0.1" style="width: 80px; margin-left: 6px;" />
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div style="margin-top: 8px; color: #6c757d; font-size: 12px;">
                    O JSON abaixo é atualizado automaticamente conforme você escolhe as opções.
                </div>
            </div>`
        );

        // Place builder to the right of the textarea in a robust way:
        // wrap the textarea in a flex container inside its immediate parent.
        const wrapperId = 'gs_style_config_flex';
        if (!document.getElementById(wrapperId)) {
            const parent = styleTextarea.parent();
            const wrapper = $(`<div id="${wrapperId}" style="display:flex; gap: 12px; align-items:flex-start; flex-wrap:wrap;"></div>`);
            const left = $('<div style="flex: 1 1 360px; min-width: 320px;"></div>');
            const right = $('<div style="flex: 1 1 360px; min-width: 320px;"></div>');

            styleTextarea.css({ width: '100%', boxSizing: 'border-box' });
            left.append(styleTextarea);
            right.append(container);
            wrapper.append(left, right);

            // Insert wrapper before any help text, if present.
            const help = parent.find('.help, .helptext').first();
            if (help.length) {
                help.before(wrapper);
            } else {
                parent.prepend(wrapper);
            }
        } else {
            // If wrapper already exists, ensure builder is in the right column.
            $(`#${wrapperId} #${containerId}`).remove();
            $(`#${wrapperId}`).children().last().append(container);
        }

        const $typeValue = $('#gs_style_type_value');
        const $fill = $('#gs_style_fill');
        const $fillText = $('#gs_style_fill_text');
        const $stroke = $('#gs_style_stroke');
        const $strokeText = $('#gs_style_stroke_text');
        const $strokeWidth = $('#gs_style_stroke_width');
        const $pointRow = $('#gs_style_point_row');
        const $radius = $('#gs_style_radius');
        const $labelEnabled = $('#gs_label_enabled');
        const $labelField = $('#gs_label_field');
        const $labelOptsRow = $('#gs_label_opts_row');
        const $labelFont = $('#gs_label_font');
        const $labelColor = $('#gs_label_color');
        const $labelOffsetY = $('#gs_label_offsety');
        const $labelHalo = $('#gs_label_halo');
        const $labelHaloWidth = $('#gs_label_halowidth');

        let lastAttributes = [];

        function effectiveGeomType() {
            const v = geomSelect.val();
            return (v === 'Point' || v === 'LineString' || v === 'Polygon') ? v : 'Polygon';
        }

        function syncTypeUi() {
            const geomType = effectiveGeomType();
            $typeValue.text(geomType);
            $pointRow.toggle(geomType === 'Point');
        }

        function setColorPair($color, $text, value, fallback) {
            const c = toHexColor(value, fallback);
            $color.val(c);
            $text.val(c);
        }

        function normalizeFromTextarea() {
            const geomType = effectiveGeomType();
            const parsed = parseJsonSafe(styleTextarea.val(), null);
            const base = defaultByGeom(geomType);
            let cfg = (parsed && typeof parsed === 'object') ? parsed : null;
            // If null/blank/invalid, start from defaults. If it's an object, merge missing keys from defaults.
            cfg = cfg ? Object.assign({}, base, cfg) : base;

            // Always keep type in sync (automatic)
            cfg.type = geomType;

            // Fill/stroke defaults
            setColorPair($fill, $fillText, cfg.fillColor, toHexColor(cfg.fillColor, '#e69800'));
            // If fill is not hex (rgba), color input can't represent it. Keep text anyway.
            if (typeof cfg.fillColor === 'string' && cfg.fillColor.startsWith('rgba')) {
                $fillText.val(cfg.fillColor);
                $fill.val('#ffffff');
            }

            setColorPair($stroke, $strokeText, cfg.strokeColor, '#000000');
            $strokeWidth.val(toNumber(cfg.strokeWidth, 1));
            $radius.val(toNumber(cfg.radius, 8));

            const label = (cfg.label && typeof cfg.label === 'object') ? cfg.label : null;
            const enabled = !!(label && typeof label.field === 'string' && label.field.trim());
            $labelEnabled.prop('checked', enabled);
            $labelOptsRow.toggle(enabled);
            $labelField.val(enabled ? label.field : '');

            $labelFont.val((label && typeof label.font === 'string') ? label.font : '11px Noto Sans Regular');
            setColorPair($labelColor, $('<input />'), (label && label.color) ? label.color : '#282828', '#282828');
            $labelOffsetY.val(toNumber(label ? label.offsetY : -12, -12));
            setColorPair($labelHalo, $('<input />'), (label && label.haloColor) ? label.haloColor : '#ffffff', '#ffffff');
            $labelHaloWidth.val(toNumber(label ? label.haloWidth : 1.5, 1.5));

            // Persist normalized cfg (keeps type synced)
            styleTextarea.val(JSON.stringify(cfg));
            syncTypeUi();
        }

        function rebuildStyleConfig() {
            const geomType = effectiveGeomType();
            const base = defaultByGeom(geomType);
            const current = parseJsonSafe(styleTextarea.val(), {})
            const currentObj = (current && typeof current === 'object') ? current : {}
            const cfg = Object.assign({}, base, currentObj);

            // Type is always automatic
            cfg.type = geomType;

            // Fill color
            const fillText = String($fillText.val() || '').trim();
            if (fillText && (/^rgba\(/i.test(fillText) || /^#[0-9a-fA-F]{6}$/.test(fillText))) {
                cfg.fillColor = fillText;
            } else {
                cfg.fillColor = toHexColor($fill.val(), cfg.fillColor);
            }

            const strokeText = String($strokeText.val() || '').trim();
            if (strokeText && /^#[0-9a-fA-F]{6}$/.test(strokeText)) {
                cfg.strokeColor = strokeText;
            } else {
                cfg.strokeColor = toHexColor($stroke.val(), cfg.strokeColor);
            }
            cfg.strokeWidth = toNumber($strokeWidth.val(), cfg.strokeWidth);
            if (geomType === 'Point') {
                cfg.radius = toNumber($radius.val(), cfg.radius);
            }

            if ($labelEnabled.is(':checked')) {
                const field = String($labelField.val() || '');
                const existingLabel = (cfg.label && typeof cfg.label === 'object') ? cfg.label : {};
                cfg.label = Object.assign({}, existingLabel, {
                    font: String($labelFont.val() || '11px Noto Sans Regular'),
                    color: toHexColor($labelColor.val(), '#282828'),
                    field: field,
                    offsetY: toNumber($labelOffsetY.val(), -12),
                    haloColor: toHexColor($labelHalo.val(), '#ffffff'),
                    haloWidth: toNumber($labelHaloWidth.val(), 1.5),
                });
            }
            if (!$labelEnabled.is(':checked')) {
                delete cfg.label;
            }

            styleTextarea.val(JSON.stringify(cfg));
        }

        function updateLabelFieldOptions(attrs) {
            lastAttributes = Array.isArray(attrs) ? attrs : [];
            const current = String($labelField.val() || '');
            $labelField.empty().append('<option value="">-- selecione --</option>');
            lastAttributes.forEach(a => {
                if (!a || typeof a.name !== 'string') return;
                $labelField.append(`<option value="${a.name}">${a.name}</option>`);
            });
            if (current && !$labelField.find(`option[value="${current}"]`).length) {
                $labelField.append(`<option value="${current}" selected>${current} (atual)</option>`);
            }
            if (current) $labelField.val(current);
        }

        // Wire events
        $fill.on('input change', () => { $fillText.val($fill.val()); rebuildStyleConfig(); });
        $fillText.on('change', () => { rebuildStyleConfig(); });
        $stroke.on('input change', () => { $strokeText.val($stroke.val()); rebuildStyleConfig(); });
        $strokeText.on('change', () => { rebuildStyleConfig(); });
        $strokeWidth.on('input change', rebuildStyleConfig);
        $radius.on('input change', rebuildStyleConfig);

        $labelEnabled.on('change', () => {
            $labelOptsRow.toggle($labelEnabled.is(':checked'));
            rebuildStyleConfig();
        });
        $labelField.on('change', rebuildStyleConfig);
        $labelFont.on('change', rebuildStyleConfig);
        $labelColor.on('input change', rebuildStyleConfig);
        $labelOffsetY.on('input change', rebuildStyleConfig);
        $labelHalo.on('input change', rebuildStyleConfig);
        $labelHaloWidth.on('input change', rebuildStyleConfig);

        geomSelect.on('change', () => {
            syncTypeUi();
            // Keep existing config but ensure type is synced; if null/empty, generate defaults.
            normalizeFromTextarea();
        });

        // When attributes load, refresh label field selector.
        $(document).on('gs:attributesLoaded', (_evt, _layerName, attrs) => {
            updateLabelFieldOptions(attrs);
        });

        // Initialize
        syncTypeUi();
        normalizeFromTextarea();

        // If attributes were already loaded before this builder initialized, try to read from table.
        const existingAttrs = [];
        $('#gs_fields_tbody tr').each(function() {
            const n = $(this).data('field');
            if (typeof n === 'string') existingAttrs.push({ name: n });
        });
        if (existingAttrs.length) updateLabelFieldOptions(existingAttrs);
    })();
    }

    function tryInit(attempt) {
        const maxAttempts = 60; // ~3s at 50ms
        if (window.django && django.jQuery) {
            initWithJQuery(django.jQuery);
            return;
        }

        if (attempt >= maxAttempts) {
            // Give up silently; admin should still be usable.
            return;
        }

        setTimeout(() => tryInit(attempt + 1), 50);
    }

    // If this file is loaded async after DOMContentLoaded, our code must still run.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { tryInit(0); });
    } else {
        tryInit(0);
    }
})();
