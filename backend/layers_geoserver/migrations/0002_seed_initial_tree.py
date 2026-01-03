from django.db import migrations


def seed_initial_tree(apps, schema_editor):
    RootGroup = apps.get_model("layers_geoserver", "RootGroup")
    ThematicGroup = apps.get_model("layers_geoserver", "ThematicGroup")
    Layer = apps.get_model("layers_geoserver", "Layer")

    # ROOT GROUP 1: INFOVIA
    infovia, _ = RootGroup.objects.update_or_create(
        id="infovia",
        defaults={
            "title": "INFOVIA",
            "service_type": "WFS",
            "workspace": "infovia_post",
            "visible": True,
            "order": 0,
        },
    )

    # ROOT GROUP 2: Dados abertos
    dados_abertos, _ = RootGroup.objects.update_or_create(
        id="dados-abertos",
        defaults={
            "title": "Dados abertos",
            "service_type": "WMS",
            "workspace": "dados_abertos_poa",
            "visible": True,
            "order": 1,
        },
    )

    # 2.1 POP (child direto)
    Layer.objects.update_or_create(
        id="infovia-pop",
        defaults={
            "root_group": infovia,
            "thematic_group": None,
            "title": "POP",
            "layer_name": "pop",
            "workspace": infovia.workspace,
            "service_type": infovia.service_type,
            "visible": True,
            "order": 0,
            "geometry_type": "Point",
            "min_zoom": 11,
            "queryable": True,
            "queryable_fields": ["nome", "endereco"],
            "table_fields": [
                {"name": "nome", "label": "Nome"},
                {"name": "endereco", "label": "Endereço"},
            ],
            "popup_template": {
                "title": "POP: {nome}",
                "fields": [
                    {"name": "nome", "label": "nome"},
                    {"name": "endereco", "label": "Endereço"},
                ],
            },
            "style_config": {
                "type": "Point",
                "radius": 8,
                "fillColor": "#e69800",
                "strokeColor": "#000000",
                "strokeWidth": 0.5,
                "label": {
                    "field": "nome",
                    "font": "11px Noto Sans Regular",
                    "color": "#282828",
                    "haloColor": "#ffffff",
                    "haloWidth": 1.5,
                    "offsetY": -12,
                },
            },
        },
    )

    # 2.2 Grupo Temático: Caixas de Emenda Procempa
    caixas_emenda_procempa, _ = ThematicGroup.objects.update_or_create(
        id="infovia-caixas-emenda-procempa",
        defaults={
            "root_group": infovia,
            "title": "Caixas de Emenda Procempa",
            "visible": True,
            "order": 1,
        },
    )

    base_q_fields = [
        {"name": "nome", "label": "nome"},
        {"name": "endereco", "label": "Endereço"},
    ]

    Layer.objects.update_or_create(
        id="infovia-caixas-emenda-aereas",
        defaults={
            "root_group": infovia,
            "thematic_group": caixas_emenda_procempa,
            "title": "Aéreas",
            "layer_name": "Caixas_de_emenda_aereas",
            "workspace": infovia.workspace,
            "service_type": infovia.service_type,
            "visible": True,
            "order": 0,
            "geometry_type": "Point",
            "min_zoom": 17,
            "queryable": True,
            "queryable_fields": base_q_fields,
            "popup_template": {
                "title": "Caixas de Emenda Procempa - Aéreas: {nome}",
                "fields": [
                    {"name": "nome", "label": "nome"},
                    {"name": "endereco", "label": "Endereço"},
                    {"name": "latitude", "label": "latitude"},
                    {"name": "longitude", "label": "longitude"},
                ],
            },
            "style_config": {
                "type": "Point",
                "radius": 6,
                "fillColor": "#ff00ff",
                "strokeColor": "#000000",
                "strokeWidth": 0.5,
                "label": {
                    "field": "nome",
                    "font": "10px Noto Sans Regular",
                    "color": "#282828",
                    "haloColor": "#ffffff",
                    "haloWidth": 1.5,
                    "offsetY": -10,
                },
            },
        },
    )

    Layer.objects.update_or_create(
        id="infovia-caixas-emenda-subterraneas",
        defaults={
            "root_group": infovia,
            "thematic_group": caixas_emenda_procempa,
            "title": "Subterrâneas",
            "layer_name": "Caixas_de_emenda _subterraneas",
            "workspace": infovia.workspace,
            "service_type": infovia.service_type,
            "visible": True,
            "order": 1,
            "geometry_type": "Point",
            "min_zoom": 17,
            "queryable": True,
            "queryable_fields": base_q_fields,
            "popup_template": {
                "title": "Caixas de Emenda Procempa - Subterrâneas: {nome}",
                "fields": [
                    {"name": "nome", "label": "nome"},
                    {"name": "endereco", "label": "Endereço"},
                    {"name": "latitude", "label": "latitude"},
                    {"name": "longitude", "label": "longitude"},
                ],
            },
            "style_config": {
                "type": "Point",
                "radius": 6,
                "fillColor": "#ffaa00",
                "strokeColor": "#000000",
                "strokeWidth": 0.5,
                "label": {
                    "field": "nome",
                    "font": "10px Noto Sans Regular",
                    "color": "#282828",
                    "haloColor": "#ffffff",
                    "haloWidth": 1.5,
                    "offsetY": -10,
                },
            },
        },
    )

    # 2.3 Grupo Temático: Caixas de Emenda de Terceiros
    caixas_emenda_terceiros, _ = ThematicGroup.objects.update_or_create(
        id="infovia-caixas-emenda-terceiros",
        defaults={
            "root_group": infovia,
            "title": "Caixas de Emenda de Terceiros",
            "visible": True,
            "order": 2,
        },
    )

    Layer.objects.update_or_create(
        id="infovia-caixas-emenda-terceiros-rnp",
        defaults={
            "root_group": infovia,
            "thematic_group": caixas_emenda_terceiros,
            "title": "RNP",
            "layer_name": "caixas_de_emenda_terceiros",
            "workspace": infovia.workspace,
            "service_type": infovia.service_type,
            "visible": True,
            "order": 0,
            "geometry_type": "Point",
            "min_zoom": 17,
            "queryable": True,
            "filter": ["==", "item", "-CE RNP"],
            "style_config": {
                "type": "Point",
                "radius": 6,
                "fillColor": "#ffff00",
                "strokeColor": "#000000",
                "strokeWidth": 0.5,
                "label": {
                    "field": "nome",
                    "font": "10px Noto Sans Regular",
                    "color": "#282828",
                    "haloColor": "#ffffff",
                    "haloWidth": 1.5,
                    "offsetY": -10,
                },
            },
        },
    )

    # 2.4 Grupo Temático: Caixas Subterrâneas Procempa
    caixas_sub_procempa, _ = ThematicGroup.objects.update_or_create(
        id="infovia-caixas-subterraneas-procempa",
        defaults={
            "root_group": infovia,
            "title": "Caixas Subterrâneas Procempa",
            "visible": True,
            "order": 3,
        },
    )

    caixas_sub_popup = {
        "title": "Caixas Subterrâneas Procempa - cx: {nome}",
        "fields": [
            {"name": "nome", "label": "nome"},
            {"name": "endereco", "label": "Endereço"},
            {"name": "ponto_de_referencia", "label": "Ponto de Referência"},
            {"name": "observacao", "label": "Observação"},
        ],
    }

    caixas_sub_table = [
        {"name": "nome", "label": "nome"},
        {"name": "endereco", "label": "Endereço"},
        {"name": "ponto_de_referencia", "label": "Ponto de Referência"},
        {"name": "observacao", "label": "Observação"},
    ]

    def caixas_style(fill_color: str):
        return {
            "type": "Point",
            "radius": 6,
            "fillColor": fill_color,
            "strokeColor": "#000000",
            "strokeWidth": 0.5,
            "label": {
                "field": "nome",
                "font": "10px Noto Sans Regular",
                "color": "#282828",
                "haloColor": "#ffffff",
                "haloWidth": 1.5,
                "offsetY": -10,
            },
        }

    caixas_layers = [
        (
            "infovia-caixas-sub-procempa-fora-padrao",
            "Fora do Padrão R1, R2 e R3",
            "Caixas_subterraneas_procempa_Fora_do_Padrao_R1_R2_R3",
            "#ff00ff",
            0,
        ),
        (
            "infovia-caixas-sub-procempa-r1",
            "R1",
            "Caixas_subterraneas_procempa_R1",
            "#ff00ff",
            1,
        ),
        (
            "infovia-caixas-sub-procempa-r2",
            "R2",
            "Caixas_subterraneas_procempa_R2",
            "#ff0000",
            2,
        ),
        (
            "infovia-caixas-sub-procempa-r3",
            "R3",
            "Caixas_subterraneas_procempa_R3",
            "#ff00ff",
            3,
        ),
    ]

    for layer_id, title, layer_name, fill_color, order in caixas_layers:
        Layer.objects.update_or_create(
            id=layer_id,
            defaults={
                "root_group": infovia,
                "thematic_group": caixas_sub_procempa,
                "title": title,
                "layer_name": layer_name,
                "workspace": infovia.workspace,
                "service_type": infovia.service_type,
                "visible": True,
                "order": order,
                "geometry_type": "Point",
                "min_zoom": 17,
                "queryable": True,
                "popup_template": caixas_sub_popup,
                "table_fields": caixas_sub_table,
                "style_config": caixas_style(fill_color),
            },
        )

    # 2.5 Grupo Temático: Cabos de Fibra Ótica Aéreos Procempa
    cabos_aereos, _ = ThematicGroup.objects.update_or_create(
        id="infovia-cabos-aereos-procempa",
        defaults={
            "root_group": infovia,
            "title": "Cabos de Fibra Ótica Aéreos Procempa",
            "visible": True,
            "order": 4,
        },
    )

    cabos_popup = {
        "title": "Cabo: {cabo}",
        "fields": [
            {"name": "cabo", "label": "Cabo"},
            {"name": "length", "label": "Comprimento (m)"},
        ],
    }

    cabos_aereos_style = {
        "type": "LineString",
        "strokeColor": "#ff00ff",
        "strokeWidth": 2,
        "label": {
            "field": "cabo",
            "font": "10px Noto Sans Regular",
            "color": "#000000",
            "haloColor": "#ffffff",
            "haloWidth": 2,
            "placement": "line",
        },
    }

    cabos_aereos_layers = [
        "Cabos_de_fibra_otica_aereos_Procempa_Com_04_Fibras_oticas",
        "Cabos_de_fibra_otica_aereos_Procempa_Com_06_Fibras_Oticas",
        "Cabos_de_fibra_otica_aereos_Procempa_Com_06_Fibras_Oticas_DGT",
        "Cabos_de_fibra_otica_aereos_Procempa_Com_08_Fibras_Oticas",
        "Cabos_de_fibra_otica_aereos_Procempa_Com_12_Fibras_Oticas",
        "Cabos_de_fibra_otica_aereos_Procempa_Com_24_Fibras_Oticas",
        "Cabos_de_fibra_otica_aereos_Procempa_Com_36_Fibras_Oticas",
        "Cabos_de_fibra_otica_aereos_Procempa_Com_48_Fibras_Oticas",
        "Cabos_de_fibra_otica_aereos_Procempa_Com_72_Fibras_Oticas",
        "Cabos_de_fibra_otica_aereos_Procempa_Sem_quantidade_definida_de_Fibras_Oticas",
    ]

    for idx, lname in enumerate(cabos_aereos_layers):
        Layer.objects.update_or_create(
            id=f"infovia-cabos-aereos-{idx}",
            defaults={
                "root_group": infovia,
                "thematic_group": cabos_aereos,
                "title": lname,
                "layer_name": lname,
                "workspace": infovia.workspace,
                "service_type": infovia.service_type,
                "visible": True,
                "order": idx,
                "geometry_type": "LineString",
                "queryable": True,
                "popup_template": cabos_popup,
                "style_config": cabos_aereos_style,
            },
        )

    # 2.6 Grupo Temático: Cabos de Fibra Ótica Subterrâneos Procempa
    cabos_sub, _ = ThematicGroup.objects.update_or_create(
        id="infovia-cabos-subterraneos-procempa",
        defaults={
            "root_group": infovia,
            "title": "Cabos de Fibra Ótica Subterrâneos Procempa",
            "visible": True,
            "order": 5,
        },
    )

    cabos_sub_style = {
        "type": "LineString",
        "strokeColor": "#ffaa00",
        "strokeWidth": 2,
        "label": {
            "field": "cabo",
            "font": "10px Noto Sans Regular",
            "color": "#000000",
            "haloColor": "#ffffff",
            "haloWidth": 2,
            "placement": "line",
        },
    }

    cabos_sub_layers = [
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_04_Fibras_Oticas",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_06_Fibras_Oticas",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_12_Fibras_Oticas",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_12_Fibras_Oticas_Dacao_Interlig",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_24_Fibras_Oticas",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_36_Fibras_Oticas",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_48_Fibras_Oticas",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_48_Fibras_Oticas_no_duto_AT_T",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Com_72_Fibras_Oticas",
        "Cabos_de_fibra_otica_subterraneos_Procempa_Sem_quantidade_definida_de_Fibras_Oticas",
    ]

    for idx, lname in enumerate(cabos_sub_layers):
        Layer.objects.update_or_create(
            id=f"infovia-cabos-sub-{idx}",
            defaults={
                "root_group": infovia,
                "thematic_group": cabos_sub,
                "title": lname,
                "layer_name": lname,
                "workspace": infovia.workspace,
                "service_type": infovia.service_type,
                "visible": True,
                "order": idx,
                "geometry_type": "LineString",
                "queryable": True,
                "popup_template": cabos_popup,
                "style_config": cabos_sub_style,
            },
        )

    # 2.7 Grupo Temático: Cabos de Fibra Ótica de Terceiros
    cabos_terceiros, _ = ThematicGroup.objects.update_or_create(
        id="infovia-cabos-terceiros",
        defaults={
            "root_group": infovia,
            "title": "Cabos de Fibra Ótica de Terceiros",
            "visible": True,
            "order": 6,
        },
    )

    terceiros_layers = [
        (
            "infovia-cabos-terceiros-ceee",
            "CEEE - 4 Fibras Óticas Procempa",
            "Cabos_de_fibra_otica_de_terceiros_CEEE_4_Fibras_Oticas_Procempa",
            "#0084a8",
            0,
        ),
        (
            "infovia-cabos-terceiros-comepp",
            "COMEP",
            "Cabos_de_fibra_otica_de_terceiros_COMEP",
            "#ffff00",
            1,
        ),
    ]

    for layer_id, title, lname, color, order in terceiros_layers:
        style = dict(cabos_aereos_style)
        style["strokeColor"] = color
        Layer.objects.update_or_create(
            id=layer_id,
            defaults={
                "root_group": infovia,
                "thematic_group": cabos_terceiros,
                "title": title,
                "layer_name": lname,
                "workspace": infovia.workspace,
                "service_type": infovia.service_type,
                "visible": True,
                "order": order,
                "geometry_type": "LineString",
                "queryable": True,
                "popup_template": cabos_popup,
                "style_config": style,
            },
        )

    # Dutos Procempa
    dutos, _ = ThematicGroup.objects.update_or_create(
        id="infovia-dutos-procempa",
        defaults={
            "root_group": infovia,
            "title": "Dutos Procempa",
            "visible": True,
            "order": 7,
        },
    )

    dutos_popup = {
        "title": "Duto: {duto}",
        "fields": [
            {"name": "duto", "label": "Duto"},
            {"name": "length", "label": "Comprimento (m)"},
        ],
    }

    def dutos_style(stroke: str):
        return {
            "type": "LineString",
            "strokeColor": stroke,
            "strokeWidth": 4,
            "label": {
                "field": "duto",
                "font": "10px Noto Sans Regular",
                "color": "#000000",
                "haloColor": "#ffffff",
                "haloWidth": 2,
                "placement": "line",
            },
        }

    dutos_layers = [
        ("infovia-dutos-procempa-vala", "Vala Procempa", "Duto_Procempa", "#00ffff", 0),
        ("infovia-dutos-procempa-att", "Vala compartilhada ou paralela com AT&T", "Duto_Procempa_ATT", "#00ffff", 1),
        ("infovia-dutos-procempa-ceee", "Vala compartilhada ou paralela com a CEEE", "Duto_Procempa_CEEE", "#00ffff", 2),
        ("infovia-dutos-procempa-eletronet", "Vala compartilhada ou paralela com Eletronet", "Duto_Procempa_Eletronet", "#00ffff", 3),
        ("infovia-dutos-procempa-gvt", "Vala compartilhada ou paralela com GVT", "Duto_Procempa_GVT", "#00ffff", 4),
        ("infovia-dutos-procempa-interlig", "Vala compartilhada ou paralela com Interlig", "Duto_Procempa_Interlig", "#00ffff", 5),
        ("infovia-dutos-procempa-telefonica", "Vala compartilhada ou paralela com Telefônica", "Duto_Procempa_Telefonica", "#00ffff", 6),
        ("infovia-dutos-procempa-sulgas", "Vala compartilhada ou paralela com Sulgás", "Duto_Procempa_Sulgas", "#98e600", 7),
    ]

    for layer_id, title, lname, color, order in dutos_layers:
        Layer.objects.update_or_create(
            id=layer_id,
            defaults={
                "root_group": infovia,
                "thematic_group": dutos,
                "title": title,
                "layer_name": lname,
                "workspace": infovia.workspace,
                "service_type": infovia.service_type,
                "visible": True,
                "order": order,
                "geometry_type": "LineString",
                "queryable": True,
                "popup_template": dutos_popup,
                "style_config": dutos_style(color),
            },
        )

    # ROOT GROUP 2: Dados abertos (WMS) - layer direto
    Layer.objects.update_or_create(
        id="dados-abertos",
        defaults={
            "root_group": dados_abertos,
            "thematic_group": None,
            "title": "Dados abertos",
            "layer_name": "Bairros_LC12112_16",
            "workspace": dados_abertos.workspace,
            "service_type": dados_abertos.service_type,
            "visible": True,
            "order": 0,
            "geometry_type": "Polygon",
            "min_zoom": None,
            "queryable": True,
            "queryable_fields": [],
            "table_fields": [],
            "popup_template": {},
            "style_config": {},
        },
    )


def unseed_initial_tree(apps, schema_editor):
    RootGroup = apps.get_model("layers_geoserver", "RootGroup")
    RootGroup.objects.filter(id__in=["infovia", "dados-abertos"]).delete()


class Migration(migrations.Migration):
    dependencies = [("layers_geoserver", "0001_initial")]

    operations = [migrations.RunPython(seed_initial_tree, reverse_code=unseed_initial_tree)]
