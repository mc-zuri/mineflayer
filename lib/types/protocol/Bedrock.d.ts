// Generated from minecraft-data's protocol definitions: do not edit.
import type { NBT, Tags, TagType } from "prismarine-nbt";

export namespace MCProtocol.Bedrock {

	/** a 64-bit integer as protodef reads it: [high, low], its valueOf() the bigint */
	export type Int64 = [number, number] & { valueOf (): bigint };
	/** what protodef writes as a 64-bit integer */
	export type Int64Write = bigint | number | [number, number];
	export type Vec3f = { x: number; y: number; z: number };
	/** a named NBT tag of any type (Bedrock's nbtLoop elements) */
	export type NamedTag = Tags[TagType] & { name: string };
	/** a relative move in 1/4096 block (Java vecDelta, 26.3+): one delta or several ticks' steps */
	export type DeltaStep = { dX: number; dY: number; dZ: number };
	export type VecDelta = { onGround: boolean } & (DeltaStep | { steps: Array<DeltaStep & { ticks: number }> });

}

export namespace MCProtocol.Bedrock.Read.Types {
	export type ByteArray = Buffer;
	export type SignedByteArray = Buffer;
	export type LittleString = string;
	export type LatinString = string;
	/**
	 * Versions: 1.16.201 – 1.21.20
	 */
	export type BehaviourPackInfos = {
		uuid: string;
		version: string;
		size: Int64;
		content_key: string;
		sub_pack_name: string;
		content_identity: string;
		has_scripts: boolean;
		addon_pack?: boolean | undefined;
	}[];
	/**
	 * As of 1.26.40 the pack list is prefixed with a varint count instead of a little endian short.
	 */
	export type TexturePackInfos = {
		uuid: string;
		version: string;
		size: Int64;
		content_key: string;
		sub_pack_name: string;
		content_identity: string;
		has_scripts: boolean;
		rtx_enabled: boolean;
		addon_pack?: boolean | undefined;
		/** cdn_url is a URL that the client can use to download the pack instead of the server sending it in chunks, which it will continue to do if this field is left empty. */
		cdn_url?: string | undefined;
	}[];
	export type ResourcePackIdVersions = {
		/** The ID of the resource pack. */
		uuid: string;
		/** The version of the resource pack. */
		version: string;
		/** The subpack name of the resource pack. */
		name: string;
	}[];
	export type ResourcePackIds = string[];
	export type Experiment = {
		name: string;
		enabled: boolean;
	};
	export type Experiments = Experiment[];
	export type GameMode = "survival" | "creative" | "adventure" | "survival_spectator" | "creative_spectator" | "fallback" | number | "spectator";
	/**
	 * Versions: 1.16.201 – 1.21.100
	 */
	export type GameRule = {
		/** Versions: 1.16.201 – 1.21.100 */
		name: string;
		/** Versions: 1.16.201 – 1.21.100 */
		type: "bool" | "int" | "float" | number;
		/** Versions: 1.16.201 – 1.21.100 */
		value?: boolean | number | undefined;
		/** Versions: 1.17.0 – 1.21.100 */
		editable?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.21.100
	 */
	export type GameRules = GameRule[];
	/**
	 * CacheBlob represents a blob as used in the client side blob cache protocol. It holds a hash of its data and
	 * the full data of it.
	 */
	export type Blob = {
		/** Hash is the hash of the blob. The hash is computed using xxHash, and must be deterministic for the same chunk data. */
		hash: Int64;
		/** Payload is the data of the blob. When sent, the client will associate the Hash of the blob with the Payload in it. */
		payload: ByteArray;
	};
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type BlockPalette = {
		name: string;
		state: NBT;
	}[];
	export type Itemstates = {
		name: string;
		runtime_id: number;
		component_based: boolean;
		/** Version is the version of the item entry which is used by the client to determine how to handle the item entry. It is one of the constants above. */
		version?: "legacy" | "data_driven" | "none" | number | undefined;
		/** Components on the item */
		nbt?: NBT | undefined;
	}[];
	/**
	 * Versions: 1.16.201 – 1.26.30
	 */
	export type Item = {
		/** Versions: 1.16.201 – 1.26.30 */
		network_id: number;
		/** Versions: 1.16.201 – 1.16.210 */
		auxiliary_value?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		has_nbt?: true | number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		nbt?: {
			version: number;
			nbt: NBT;
		} | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		can_place_on?: string[] | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		can_destroy?: string[] | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		blocking_tick?: bigint | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		count?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		metadata?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		has_stack_id?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		stack_id?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		block_runtime_id?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		extra?: ItemExtraDataWithBlockingTick | ItemExtraDataWithoutBlockingTick | undefined;
	};
	export type vec3i = {
		x: number;
		y: number;
		z: number;
	};
	export type vec3u = {
		x: number;
		y: number;
		z: number;
	};
	export type vec3f = {
		x: number;
		y: number;
		z: number;
	};
	export type vec2f = {
		x: number;
		z: number;
	};
	export type MetadataDictionary = {
		/** https://github.com/pmmp/PocketMine-MP/blob/stable/src/pocketmine/entity/Entity.php#L101 */
		key: "index" | "health" | "variant" | "color" | "nametag" | "owner_eid" | "target_eid" | "air" | "potion_color" | "potion_ambient" | "jump_duration" | "hurt_time" | "hurt_direction" | "paddle_time_left" | "paddle_time_right" | "experience_value" | "minecart_display_block" | "minecart_display_offset" | "minecart_has_display" | "old_swell" | "swell_dir" | "charge_amount" | "enderman_held_runtime_id" | "entity_age" | "player_flags" | "player_index" | "player_bed_position" | "fireball_power_x" | "fireball_power_y" | "fireball_power_z" | "aux_power" | "fish_x" | "fish_z" | "fish_angle" | "potion_aux_value" | "lead_holder_eid" | "scale" | "interactive_tag" | "npc_skin_id" | "url_tag" | "max_airdata_max_air" | "mark_variant" | "container_type" | "container_base_size" | "container_extra_slots_per_strength" | "block_target" | "wither_invulnerable_ticks" | "wither_target_1" | "wither_target_2" | "wither_target_3" | "aerial_attack" | "boundingbox_width" | "boundingbox_height" | "fuse_length" | "rider_seat_position" | "rider_rotation_locked" | "rider_max_rotation" | "rider_min_rotation" | "area_effect_cloud_radius" | "area_effect_cloud_waiting" | "area_effect_cloud_particle_id" | "shulker_peek_id" | "shulker_attach_face" | "shulker_attached" | "shulker_attach_pos" | "trading_player_eid" | "trading_career" | "has_command_block" | "command_block_command" | "command_block_last_output" | "command_block_track_output" | "controlling_rider_seat_number" | "strength" | "max_strength" | "spell_casting_color" | "limited_life" | "armor_stand_pose_index" | "ender_crystal_time_offset" | "always_show_nametag" | "color_2" | "name_author" | "score_tag" | "balloon_attached_entity" | "pufferfish_size" | "bubble_time" | "agent" | "sitting_amount" | "sitting_amount_previous" | "eating_counter" | "flags_extended" | "laying_amount" | "laying_amount_previous" | "duration" | "spawn_time" | "change_rate" | "change_on_pickup" | "pickup_count" | "interact_text" | "trade_tier" | "max_trade_tier" | "trade_experience" | "skin_id" | "spawning_frames" | "command_block_tick_delay" | "command_block_execute_on_first_tick" | "ambient_sound_interval" | "ambient_sound_interval_range" | "ambient_sound_event_name" | "fall_damage_multiplier" | "name_raw_text" | "can_ride_target" | "low_tier_cured_discount" | "high_tier_cured_discount" | "nearby_cured_discount" | "nearby_cured_discount_timestamp" | "hitbox" | "is_buoyant" | "buoyancy_data" | number | "flags" | "horse_type" | "creeper_swell" | "creeper_swell_direction" | "wither_aerial_attack" | "rider_seat_rotation_offset" | "evoker_spell_casting_color" | "area_effect_cloud_duration" | "area_effect_cloud_spawn_time" | "area_effect_cloud_change_rate" | "area_effect_cloud_change_on_pickup" | "area_effect_cloud_pickup_count" | "goat_horn_count" | "freezing_effect_strength" | "base_runtime_id" | "define_properties" | "update_properties" | "movement_sound_distance_offset" | "heartbeat_interval_ticks" | "heartbeat_sound_event" | "player_last_death_position" | "player_last_death_dimension" | "player_has_died" | "collision_box" | "visible_mob_effects" | "filtered_name" | "bed_enter_position" | "seat_third_person_camera_radius" | "seat_camera_relax_distance_smoothing" | "aim_assist_priority_preset_id" | "aim_assist_priority_category_id" | "aim_assist_priority_actor_id" | "arrow_shooter_id" | "firework_direction" | "firework_shooter_id" | "reserved_139" | "nameplate_render_distance_max";
		type: "byte" | "short" | "int" | "float" | "string" | "compound" | "vec3i" | "long" | "vec3f" | number;
		value?: number | string | NBT | vec3i | bigint | vec3f | MetadataFlags1 | MetadataFlags2 | undefined;
		/** As of 1.26.40 the value type is sent twice: once as an unsigned varint and once as a byte. */
		legacy_type?: number | undefined;
	}[];
	export type Link = {
		ridden_entity_id: bigint;
		rider_entity_id: bigint;
		type: number;
		immediate: boolean;
		rider_initiated: boolean;
		/** angular velocity of the vehicle that the rider is riding. Versions: 1.21.20 – 1.26.60 */
		angular_velocity?: number | undefined;
	};
	export type Links = Link[];
	export type EntityAttributes = {
		name: string;
		min: number;
		value: number;
		max: number;
	}[];
	export type Rotation = {
		yaw: number;
		pitch: number;
		head_yaw: number;
	};
	export type BlockCoordinates = {
		x: number;
		y: number;
		z: number;
	};
	export type PlayerAttributes = {
		min: number;
		max: number;
		current: number;
		default: number;
		name: string;
		modifiers?: {
			id: string;
			name: string;
			amount: number;
			operation: number;
			operand: number;
			serializable: boolean;
		}[] | undefined;
		default_min?: number | undefined;
		default_max?: number | undefined;
	}[];
	/**
	 * As of 1.26.40 the inventory transaction embedded in PlayerAuthInput was brought back in line with the
	 * one in InventoryTransaction, so it reuses `TransactionLegacy`/`TransactionActions` above again.
	 */
	export type Transaction = {
		/** Versions: 1.16.201 */
		legacy_request_id?: number | undefined;
		/** Versions: 1.16.201 */
		legacy_transactions?: {
			container_id: number;
			changed_slots: {
				slot_id: number;
			}[];
		}[] | undefined;
		/** What type of transaction took place */
		transaction_type?: "normal" | "inventory_mismatch" | "item_use" | "item_use_on_entity" | "item_release" | number | undefined;
		/** Versions: 1.16.201 */
		network_ids?: boolean | undefined;
		/** Versions: 1.16.201 */
		inventory_actions?: {
			source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
			inventory_id?: number | undefined;
			flags?: number | undefined;
			action?: number | undefined;
			slot: number;
			old_item: Item;
			new_item: Item;
			new_item_stack_id?: number | undefined;
		}[] | undefined;
		/** Extra data if an intenal inventory transaction did not take place, e.g. use of an item */
		transaction_data?: {
			action_type: "click_block" | "click_air" | "break_block" | number;
			block_position: BlockCoordinates;
			face: number;
			hotbar_slot: number;
			held_item: Item;
			player_pos: vec3f;
			click_pos: vec3f;
			block_runtime_id: number;
		} | {
			entity_runtime_id: bigint;
			action_type: "interact" | "attack" | number;
			hotbar_slot: number;
			held_item: Item;
			player_pos: vec3f;
			click_pos: vec3f;
		} | {
			action_type: "release" | "consume" | number;
			hotbar_slot: number;
			held_item: Item;
			head_pos: vec3f;
		} | TransactionUseItem | {
			entity_runtime_id: bigint;
			action_type: "interact" | "attack" | number;
			hotbar_slot: number;
			held_item: ItemV4;
			player_pos: vec3f;
			click_pos: vec3f;
		} | {
			action_type: "release" | "consume" | number;
			hotbar_slot: number;
			held_item: ItemV4;
			head_pos: vec3f;
		} | {
			entity_runtime_id: bigint;
			action_type: "interact" | "attack" | number;
			hotbar_slot: number;
			hand: "main_hand" | "off_hand" | number;
			held_item: ItemV4;
			player_pos: vec3f;
			click_pos: vec3f;
		} | {
			action_type: "release" | "consume" | number;
			hotbar_slot: number;
			held_item: ItemV4;
			head_pos: vec3f;
			hand: "main_hand" | "off_hand" | number;
		} | undefined;
		/** Old transaction system data Versions: 1.16.210 – 1.26.60 */
		legacy?: TransactionLegacy | undefined;
		/** The list of inventory internal actions in this packet, e.g. inventory GUI actions Versions: 1.16.210 – 1.26.60 */
		actions?: TransactionActions | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type ItemStack = {
		/** Versions: 1.16.201 */
		runtime_id?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		item: Item;
		/** Versions: 1.16.210 */
		stack_id?: number | undefined;
	};
	export type ItemStacks = ItemStack[] | Item[] | ItemV4[];
	/**
	 * As of 1.26.40 the descriptor is identified by a string rather than by the numeric tag. The leading
	 * varint only distinguishes 'no descriptor' (0) from 'a descriptor follows' (1); when it is 1 the actual
	 * kind is read from the descriptor_type string. The deferred and complex alias descriptors are gone.
	 */
	export type RecipeIngredient = {
		/** Versions: 1.16.201 – 1.26.30 */
		network_id?: number | undefined;
		/** Versions: 1.16.201 – 1.19.21 */
		network_data?: number | undefined;
		count?: number | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		type?: "invalid" | "int_id_meta" | "molang" | "item_tag" | "string_id_meta" | number | "complex_alias" | "valid" | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		metadata?: number | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		expression?: string | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		version?: number | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		tag?: string | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		descriptor_type?: string | undefined;
	};
	export type PotionTypeRecipes = {
		input_item_id: number;
		input_item_meta: number;
		ingredient_id: number;
		ingredient_meta: number;
		output_item_id: number;
		output_item_meta: number;
	}[];
	export type PotionContainerChangeRecipes = {
		input_item_id: number;
		ingredient_id: number;
		output_item_id: number;
	}[];
	/**
	 * Versions: 1.16.201 – 1.26.30
	 */
	export type Recipes = {
		type: "shapeless" | "shaped" | "furnace" | "furnace_with_metadata" | "multi" | "shulker_box" | "shapeless_chemistry" | "shaped_chemistry" | number | "smithing_transform" | "smithing_trim";
		recipe?: {
			recipe_id: LatinString;
			input: RecipeIngredient[];
			output: Item[];
			uuid: string;
			block: string;
			priority: number;
			network_id: number;
		} | {
			recipe_id: LatinString;
			width: number;
			height: number;
			input: RecipeIngredient[][];
			output: Item[];
			uuid: string;
			block: string;
			priority: number;
			network_id: number;
		} | {
			input_id: number;
			output: Item;
			block: string;
		} | {
			input_id: number;
			input_meta: number;
			output: Item;
			block: string;
		} | {
			uuid: string;
			network_id: number;
		} | {
			recipe_id: LatinString;
			input: RecipeIngredient[];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			network_id: number;
		} | {
			recipe_id: LatinString;
			width: number;
			height: number;
			input: RecipeIngredient[][];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			network_id: number;
		} | {
			input_id: number;
			output: ItemLegacy;
			block: string;
		} | {
			input_id: number;
			input_meta: number;
			output: ItemLegacy;
			block: string;
		} | {
			recipe_id: LatinString;
			base: RecipeIngredient;
			addition: RecipeIngredient;
			result: ItemLegacy;
			tag: string;
			network_id: number;
		} | {
			recipe_id: LatinString;
			template: RecipeIngredient;
			base: RecipeIngredient;
			addition: RecipeIngredient;
			result: ItemLegacy;
			tag: string;
			network_id: number;
		} | {
			recipe_id: LatinString;
			template: RecipeIngredient;
			input: RecipeIngredient;
			addition: RecipeIngredient;
			block: string;
			network_id: number;
		} | {
			recipe_id: LatinString;
			width: number;
			height: number;
			input: RecipeIngredient[][];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			assume_symmetry: boolean;
			network_id: number;
		} | {
			recipe_id: LatinString;
			input: RecipeIngredient[];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			unlocking_requirement: RecipeUnlockingRequirement;
			network_id: number;
		} | {
			recipe_id: LatinString;
			width: number;
			height: number;
			input: RecipeIngredient[][];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			assume_symmetry: boolean;
			unlocking_requirement: RecipeUnlockingRequirement;
			network_id: number;
		} | undefined;
	}[];
	export type SkinImage = {
		width: number;
		height: number;
		data: string | ByteArray;
	};
	export type Skin = {
		skin_id: string;
		skin_resource_pack: string;
		skin_data: SkinImage;
		animations: {
			skin_image: SkinImage;
			animation_type: number;
			animation_frames: number;
			expression_type: number;
		}[];
		cape_data: SkinImage;
		geometry_data: string;
		animation_data: string;
		premium: string | boolean;
		persona: boolean;
		cape_on_classic: boolean;
		cape_id: string;
		full_skin_id: string;
		arm_size: string | "slim" | "wide" | number;
		skin_color: string | number;
		personal_pieces: {
			piece_id: string;
			piece_type: string | PersonaPieceType;
			pack_id: string;
			is_default_piece: boolean;
			product_id: string;
		}[];
		piece_tint_colors: {
			piece_type: string;
			colors: string[] | number[];
		}[];
		/** Versions: 1.16.210 – 1.26.51 */
		play_fab_id?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		geometry_data_version?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		primary_user?: boolean | undefined;
		/** Versions: 1.19.62 – 1.26.60 */
		overriding_player_appearance?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		trusted?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		profile_hash?: string | undefined;
	};
	/**
	 * BDS 1.26.40 may truncate the final record. Player List is a packet-bounded payload, so treat the declared
	 * count as an upper bound and stop decoding when the packet ends, including midway through the final record.
	 */
	export type PlayerRecords = {
		/** Versions: 1.16.201 – 1.26.30 */
		type: "add" | "remove" | number;
		/** Versions: 1.16.201 – 1.26.30 */
		records_count: number;
		/** Versions: 1.16.201 – 1.26.30 */
		records: Array<{
			uuid: string;
			entity_unique_id: bigint;
			username: string;
			xbox_user_id: string;
			platform_chat_id: string;
			build_platform: number;
			skin_data: Skin;
			is_teacher: boolean;
			is_host: boolean;
		} | {
			uuid: string;
		} | undefined> | Array<{
			uuid: string;
			entity_unique_id: bigint;
			username: string;
			xbox_user_id: string;
			platform_chat_id: string;
			build_platform: number;
			skin_data: Skin;
			is_teacher: boolean;
			is_host: boolean;
			is_subclient: boolean;
		} | {
			uuid: string;
		} | undefined> | Array<{
			uuid: string;
			entity_unique_id: bigint;
			username: string;
			xbox_user_id: string;
			platform_chat_id: string;
			build_platform: number;
			skin_data: Skin;
			is_teacher: boolean;
			is_host: boolean;
			is_subclient: boolean;
			player_color: number;
		} | {
			uuid: string;
		} | undefined>;
		/** Versions: 1.16.201 – 1.26.30 */
		verified?: boolean[] | undefined;
	} | PlayerRecord[];
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type ScoreEntries = {
		/** Versions: 1.16.201 – 1.16.210 */
		type: "change" | "remove" | number;
		/** Versions: 1.16.201 – 1.16.210 */
		entries: {
			scoreboard_id: bigint;
			objective_name: string;
			score: number;
			entry_type?: "player" | "entity" | "fake_player" | number | undefined;
			entity_unique_id?: bigint | undefined;
			custom_name?: string | undefined;
		}[];
	};
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type ScoreboardIdentityEntries = {
		/** Versions: 1.16.201 – 1.16.210 */
		type: "TYPE_REGISTER_IDENTITY" | "TYPE_CLEAR_IDENTITY" | number;
		/** Versions: 1.16.201 – 1.16.210 */
		entries: {
			scoreboard_id: bigint;
			entity_unique_id?: bigint | undefined;
		}[];
	};
	export type Enchant = {
		id: number;
		level: number;
	};
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type EnchantOptions = {
		cost: number;
		slot_flags: number;
		equip_enchants: Enchant[];
		held_enchants: Enchant[];
		self_enchants: Enchant[];
		name: string;
		option_id: number;
	}[];
	/**
	 * Source and Destination point to the source slot from which Count of the item stack were taken and the
	 * destination slot to which this item was moved.
	 */
	export type StackRequestSlotInfo = {
		/** Versions: 1.16.201 */
		container_id?: number | undefined;
		/** Versions: 1.16.201 */
		slot_id?: number | undefined;
		/** StackNetworkID is the unique stack ID that the client assumes to be present in this slot. The server must check if these IDs match. If they do not match, servers should reject the stack request that the action holding this info was in. As of 1.26.40 this is a little endian int instead of a zigzag varint. */
		stack_id: number;
		/** ContainerID is the ID of the container that the slot was in. Versions: 1.16.210 – 1.26.60 */
		slot_type?: ContainerSlotType | FullContainerName | undefined;
		/** Slot is the index of the slot within the container with the ContainerID above. Versions: 1.16.210 – 1.26.60 */
		slot?: number | undefined;
	};
	/**
	 * Versions: 1.16.201
	 */
	export type ItemStackRequests = {
		request_id: number;
		actions: {
			type_id: "take" | "place" | "swap" | "drop" | "destroy" | "consume" | "create" | "lab_table_combine" | "beacon_payment" | "craft_recipe" | "craft_recipe_auto" | "craft_creative" | "optional" | "non_implemented" | "results_deprecated" | number;
			count?: number | undefined;
			source?: StackRequestSlotInfo | undefined;
			destination?: StackRequestSlotInfo | undefined;
			randomly?: boolean | undefined;
			result_slot_id?: number | undefined;
			primary_effect?: number | undefined;
			secondary_effect?: number | undefined;
			recipe_network_id?: number | undefined;
			times_crafted?: number | undefined;
			creative_item_network_id?: number | undefined;
			filtered_string_index?: number | undefined;
			result_items?: Item[] | undefined;
		}[];
		custom_names: string[];
	}[];
	/**
	 * ItemStackResponse is a response to an individual ItemStackRequest.
	 */
	export type ItemStackResponses = {
		result?: number | undefined;
		/** RequestID is the unique ID of the request that this response is in reaction to. If rejected, the client will undo the actions from the request with this ID. */
		request_id: number;
		containers?: {
			container_id?: number | undefined;
			slots: {
				slot: number;
				hotbar_slot: number;
				count: number;
				item_stack_id?: number | undefined;
				custom_name: string;
				durability_correction?: number | undefined;
				filtered_custom_name?: string | undefined;
				item_stack_id_presence?: boolean | undefined;
			}[];
			slot_type?: ContainerSlotType | FullContainerName | undefined;
		}[] | undefined;
		/** Status specifies if the request with the RequestID below was successful. If this is the case, the ContainerInfo below will have information on what slots ended up changing. If not, the container info will be empty. A non-0 status means an error occurred and will result in the action being reverted. */
		status?: "ok" | "error" | number | undefined;
		containers_presence?: boolean | undefined;
	}[];
	/**
	 * Versions: 1.16.201 – 1.21.50
	 */
	export type ItemComponentList = {
		name: string;
		nbt: NBT;
	}[];
	export type CommandOrigin = {
		/** Origin is one of the values above that specifies the origin of the command. The origin may change, depending on what part of the client actually called the command. The command may be issued by a websocket server, for example. */
		type: "player" | "block" | "minecart_block" | "dev_console" | "test" | "automation_player" | "client_automation" | "dedicated_server" | "entity" | "virtual" | "game_argument" | "entity_server" | number | "precompiled" | "game_director_entity_server" | "script" | "executor" | string;
		uuid: string;
		request_id: string;
		player_entity_id?: {
			player_entity_id: bigint;
		} | Int64 | undefined;
	};
	export type WindowID = "inventory" | "first" | "last" | "offhand" | "armor" | "creative" | "hotbar" | "fixed_inventory" | "ui" | "drop_contents" | "beacon" | "trading_output" | "trading_use_inputs" | "trading_input_2" | "trading_input_1" | "enchant_output" | "enchant_material" | "enchant_input" | "anvil_output" | "anvil_result" | "anvil_material" | "container_input" | "crafting_use_ingredient" | "crafting_result" | "crafting_remove_ingredient" | "crafting_add_ingredient" | "none" | number;
	export type WindowIDVarint = "inventory" | "first" | "last" | "offhand" | "armor" | "creative" | "hotbar" | "fixed_inventory" | "ui" | "drop_contents" | "beacon" | "trading_output" | "trading_use_inputs" | "trading_input_2" | "trading_input_1" | "enchant_output" | "enchant_material" | "enchant_input" | "anvil_output" | "anvil_result" | "anvil_material" | "container_input" | "crafting_use_ingredient" | "crafting_result" | "crafting_remove_ingredient" | "crafting_add_ingredient" | "none" | number;
	export type WindowType = "container" | "workbench" | "furnace" | "enchantment" | "brewing_stand" | "anvil" | "dispenser" | "dropper" | "hopper" | "cauldron" | "minecart_chest" | "minecart_hopper" | "horse" | "beacon" | "structure_editor" | "trading" | "command_block" | "jukebox" | "armor" | "hand" | "compound_creator" | "element_constructor" | "material_reducer" | "lab_table" | "loom" | "lectern" | "grindstone" | "blast_furnace" | "smoker" | "stonecutter" | "cartography" | "hud" | "jigsaw_editor" | "smithing_table" | number | "none" | "inventory" | "chest_boat" | "decorated_pot" | "crafter";
	/**
	 * TODO: remove?
	 */
	export type LegacyEntityType = "chicken" | "cow" | "pig" | "sheep" | "wolf" | "villager" | "mooshroom" | "squid" | "rabbit" | "bat" | "iron_golem" | "snow_golem" | "ocelot" | "horse" | "donkey" | "mule" | "skeleton_horse" | "zombie_horse" | "polar_bear" | "llama" | "parrot" | "dolphin" | "zombie" | "creeper" | "skeleton" | "spider" | "zombie_pigman" | "slime" | "enderman" | "silverfish" | "cave_spider" | "ghast" | "magma_cube" | "blaze" | "zombie_villager" | "witch" | "stray" | "husk" | "wither_skeleton" | "guardian" | "elder_guardian" | "npc" | "wither" | "ender_dragon" | "shulker" | "endermite" | "agent" | "vindicator" | "phantom" | "armor_stand" | "tripod_camera" | "player" | "item" | "tnt" | "falling_block" | "moving_block" | "xp_bottle" | "xp_orb" | "eye_of_ender_signal" | "ender_crystal" | "fireworks_rocket" | "thrown_trident" | "turtle" | "cat" | "shulker_bullet" | "fishing_hook" | "chalkboard" | "dragon_fireball" | "arrow" | "snowball" | "egg" | "painting" | "minecart" | "fireball" | "splash_potion" | "ender_pearl" | "leash_knot" | "wither_skull" | "boat" | "wither_skull_dangerous" | "lightning_bolt" | "small_fireball" | "area_effect_cloud" | "hopper_minecart" | "tnt_minecart" | "chest_minecart" | "command_block_minecart" | "lingering_potion" | "llama_spit" | "evocation_fang" | "evocation_illager" | "vex" | "ice_bomb" | "balloon" | "pufferfish" | "salmon" | "drowned" | "tropicalfish" | "cod" | "panda" | number;
	export type mcpe_packet = {
		name: "login" | "play_status" | "server_to_client_handshake" | "client_to_server_handshake" | "disconnect" | "resource_packs_info" | "resource_pack_stack" | "resource_pack_client_response" | "text" | "set_time" | "start_game" | "add_player" | "add_entity" | "remove_entity" | "add_item_entity" | "take_item_entity" | "move_entity" | "move_player" | "rider_jump" | "update_block" | "add_painting" | "tick_sync" | "level_sound_event_old" | "level_event" | "block_event" | "entity_event" | "mob_effect" | "update_attributes" | "inventory_transaction" | "mob_equipment" | "mob_armor_equipment" | "interact" | "block_pick_request" | "entity_pick_request" | "player_action" | "hurt_armor" | "set_entity_data" | "set_entity_motion" | "set_entity_link" | "set_health" | "set_spawn_position" | "animate" | "respawn" | "container_open" | "container_close" | "player_hotbar" | "inventory_content" | "inventory_slot" | "container_set_data" | "crafting_data" | "crafting_event" | "gui_data_pick_item" | "adventure_settings" | "block_entity_data" | "player_input" | "level_chunk" | "set_commands_enabled" | "set_difficulty" | "change_dimension" | "set_player_game_type" | "player_list" | "simple_event" | "event" | "spawn_experience_orb" | "clientbound_map_item_data" | "map_info_request" | "request_chunk_radius" | "chunk_radius_update" | "item_frame_drop_item" | "game_rules_changed" | "camera" | "boss_event" | "show_credits" | "available_commands" | "command_request" | "command_block_update" | "command_output" | "update_trade" | "update_equipment" | "resource_pack_data_info" | "resource_pack_chunk_data" | "resource_pack_chunk_request" | "transfer" | "play_sound" | "stop_sound" | "set_title" | "add_behavior_tree" | "structure_block_update" | "show_store_offer" | "purchase_receipt" | "player_skin" | "sub_client_login" | "initiate_web_socket_connection" | "set_last_hurt_by" | "book_edit" | "npc_request" | "photo_transfer" | "modal_form_request" | "modal_form_response" | "server_settings_request" | "server_settings_response" | "show_profile" | "set_default_game_type" | "remove_objective" | "set_display_objective" | "set_score" | "lab_table" | "update_block_synced" | "move_entity_delta" | "set_scoreboard_identity" | "set_local_player_as_initialized" | "update_soft_enum" | "network_stack_latency" | "script_custom_event" | "spawn_particle_effect" | "available_entity_identifiers" | "level_sound_event_v2" | "network_chunk_publisher_update" | "biome_definition_list" | "level_sound_event" | "level_event_generic" | "lectern_update" | "video_stream_connect" | "add_ecs_entity" | "remove_ecs_entity" | "client_cache_status" | "on_screen_texture_animation" | "map_create_locked_copy" | "structure_template_data_export_request" | "structure_template_data_export_response" | "update_block_properties" | "client_cache_blob_status" | "client_cache_miss_response" | "education_settings" | "emote" | "multiplayer_settings" | "settings_command" | "anvil_damage" | "completed_using_item" | "network_settings" | "player_auth_input" | "creative_content" | "player_enchant_options" | "item_stack_request" | "item_stack_response" | "player_armor_damage" | "code_builder" | "update_player_game_type" | "emote_list" | "position_tracking_db_broadcast" | "position_tracking_db_request" | "debug_info" | "packet_violation_warning" | "motion_prediction_hints" | "animate_entity" | "camera_shake" | "player_fog" | "correct_player_move_prediction" | "item_component" | "filter_text_packet" | number | "debug_renderer" | "sync_entity_property" | "add_volume_entity" | "remove_volume_entity" | "simulation_type" | "npc_dialogue" | "edu_uri_resource_packet" | "create_photo" | "update_subchunk_blocks" | "photo_info_request" | "subchunk" | "subchunk_request" | "client_start_item_cooldown" | "script_message" | "code_builder_source" | "ticking_areas_load_status" | "dimension_data" | "agent_action" | "change_mob_property" | "lesson_progress" | "request_ability" | "request_permissions" | "toast_request" | "update_abilities" | "update_adventure_settings" | "death_info" | "editor_network" | "feature_registry" | "server_stats" | "request_network_settings" | "game_test_request" | "game_test_results" | "update_client_input_locks" | "client_cheat_ability" | "camera_presets" | "unlocked_recipes" | "camera_instruction" | "compressed_biome_definitions" | "trim_data" | "open_sign" | "agent_animation" | "refresh_entitlements" | "server_post_move" | "toggle_crafter_slot_request" | "set_player_inventory_options" | "set_hud" | "award_achievement" | "clientbound_close_form" | "serverbound_loading_screen" | "jigsaw_structure_data" | "current_structure_feature" | "serverbound_diagnostics" | "camera_aim_assist" | "container_registry_cleanup" | "movement_effect" | "set_movement_authority" | "camera_aim_assist_presets" | "item_registry" | "client_camera_aim_assist" | "client_movement_prediction_sync" | "update_client_options" | "player_video_capture" | "player_update_entity_overrides" | "player_location" | "clientbound_controls_scheme" | "server_script_debug_drawer" | "serverbound_pack_setting_change" | "graphics_override_parameter" | "clientbound_data_store" | "serverbound_data_store" | "clientbound_data_driven_ui_show_screen" | "clientbound_data_driven_ui_close_all_screens" | "clientbound_data_driven_ui_reload" | "clientbound_texture_shift" | "voxel_shapes" | "camera_spline" | "camera_aim_assist_actor_priority" | "clientbound_data_driven_ui_close_screen" | "resource_packs_ready_for_validation" | "locator_bar" | "party_changed" | "serverbound_data_driven_screen_closed" | "sync_world_clocks" | "clientbound_attribute_layer_sync" | "primitive_shapes" | "server_store_info" | "server_presence_info" | "clientbound_update_sound_data" | "send_party_destination_cookie" | "party_destination_cookie_response" | "set_player_furnace_options" | "record_started" | "clientbound_matchmaking_state" | "serverbound_stonecutter_set_recipe" | "clientbound_stonecutter_set_recipe" | "serverbound_matchmaking_cancel" | "set_passenger_of_block" | "serverbound_cursor_item_drag" | "clientbound_play_audio_content" | "serverbound_register_audio_content";
		params?: packet_login | packet_play_status | packet_server_to_client_handshake | packet_client_to_server_handshake | packet_disconnect | packet_resource_packs_info | packet_resource_pack_stack | packet_resource_pack_client_response | packet_text | packet_set_time | packet_start_game | packet_add_player | packet_add_entity | packet_remove_entity | packet_add_item_entity | packet_take_item_entity | packet_move_entity | packet_move_player | packet_rider_jump | packet_update_block | packet_add_painting | packet_tick_sync | packet_level_sound_event_old | packet_level_event | packet_block_event | packet_entity_event | packet_mob_effect | packet_update_attributes | packet_inventory_transaction | packet_mob_equipment | packet_mob_armor_equipment | packet_interact | packet_block_pick_request | packet_entity_pick_request | packet_player_action | packet_hurt_armor | packet_set_entity_data | packet_set_entity_motion | packet_set_entity_link | packet_set_health | packet_set_spawn_position | packet_animate | packet_respawn | packet_container_open | packet_container_close | packet_player_hotbar | packet_inventory_content | packet_inventory_slot | packet_container_set_data | packet_crafting_data | packet_crafting_event | packet_gui_data_pick_item | packet_adventure_settings | packet_block_entity_data | packet_player_input | packet_level_chunk | packet_set_commands_enabled | packet_set_difficulty | packet_change_dimension | packet_set_player_game_type | packet_player_list | packet_simple_event | packet_event | packet_spawn_experience_orb | packet_clientbound_map_item_data | packet_map_info_request | packet_request_chunk_radius | packet_chunk_radius_update | packet_item_frame_drop_item | packet_game_rules_changed | packet_camera | packet_boss_event | packet_show_credits | packet_available_commands | packet_command_request | packet_command_block_update | packet_command_output | packet_update_trade | packet_update_equipment | packet_resource_pack_data_info | packet_resource_pack_chunk_data | packet_resource_pack_chunk_request | packet_transfer | packet_play_sound | packet_stop_sound | packet_set_title | packet_add_behavior_tree | packet_structure_block_update | packet_show_store_offer | packet_purchase_receipt | packet_player_skin | packet_sub_client_login | packet_initiate_web_socket_connection | packet_set_last_hurt_by | packet_book_edit | packet_npc_request | packet_photo_transfer | packet_modal_form_request | packet_modal_form_response | packet_server_settings_request | packet_server_settings_response | packet_show_profile | packet_set_default_game_type | packet_remove_objective | packet_set_display_objective | packet_set_score | packet_lab_table | packet_update_block_synced | packet_move_entity_delta | packet_set_scoreboard_identity | packet_set_local_player_as_initialized | packet_update_soft_enum | packet_network_stack_latency | packet_script_custom_event | packet_spawn_particle_effect | packet_available_entity_identifiers | packet_level_sound_event_v2 | packet_network_chunk_publisher_update | packet_biome_definition_list | packet_level_sound_event | packet_level_event_generic | packet_lectern_update | packet_video_stream_connect | packet_add_ecs_entity | packet_remove_ecs_entity | packet_client_cache_status | packet_on_screen_texture_animation | packet_map_create_locked_copy | packet_structure_template_data_export_request | packet_structure_template_data_export_response | packet_update_block_properties | packet_client_cache_blob_status | packet_client_cache_miss_response | packet_education_settings | packet_emote | packet_multiplayer_settings | packet_settings_command | packet_anvil_damage | packet_completed_using_item | packet_network_settings | packet_player_auth_input | packet_creative_content | packet_player_enchant_options | packet_item_stack_request | packet_item_stack_response | packet_player_armor_damage | packet_code_builder | packet_update_player_game_type | packet_emote_list | packet_position_tracking_db_request | packet_position_tracking_db_broadcast | packet_debug_info | packet_packet_violation_warning | packet_motion_prediction_hints | packet_animate_entity | packet_camera_shake | packet_player_fog | packet_correct_player_move_prediction | packet_item_component | packet_filter_text_packet | packet_debug_renderer | packet_sync_entity_property | packet_add_volume_entity | packet_remove_volume_entity | packet_simulation_type | packet_npc_dialogue | packet_edu_uri_resource_packet | packet_create_photo | packet_update_subchunk_blocks | packet_photo_info_request | packet_subchunk | packet_subchunk_request | packet_client_start_item_cooldown | packet_script_message | packet_code_builder_source | packet_ticking_areas_load_status | packet_dimension_data | packet_agent_action | packet_change_mob_property | packet_lesson_progress | packet_request_ability | packet_request_permissions | packet_toast_request | packet_update_abilities | packet_update_adventure_settings | packet_death_info | packet_editor_network | packet_feature_registry | packet_server_stats | packet_request_network_settings | packet_game_test_request | packet_game_test_results | packet_update_client_input_locks | packet_client_cheat_ability | packet_camera_presets | packet_unlocked_recipes | packet_camera_instruction | packet_compressed_biome_definitions | packet_trim_data | packet_open_sign | packet_agent_animation | packet_refresh_entitlements | packet_toggle_crafter_slot_request | packet_set_player_inventory_options | packet_server_post_move | packet_set_hud | packet_award_achievement | packet_clientbound_close_form | packet_serverbound_loading_screen | packet_jigsaw_structure_data | packet_current_structure_feature | packet_serverbound_diagnostics | packet_camera_aim_assist | packet_container_registry_cleanup | packet_movement_effect | packet_set_movement_authority | packet_camera_aim_assist_presets | packet_item_registry | packet_client_camera_aim_assist | packet_client_movement_prediction_sync | packet_update_client_options | packet_player_video_capture | packet_player_update_entity_overrides | packet_player_location | packet_clientbound_controls_scheme | packet_server_script_debug_drawer | packet_serverbound_pack_setting_change | packet_graphics_override_parameter | packet_clientbound_data_store | packet_serverbound_data_store | packet_clientbound_data_driven_ui_show_screen | packet_clientbound_data_driven_ui_close_all_screens | packet_clientbound_data_driven_ui_reload | packet_clientbound_texture_shift | packet_voxel_shapes | packet_camera_spline | packet_camera_aim_assist_actor_priority | packet_clientbound_data_driven_ui_close_screen | packet_resource_packs_ready_for_validation | packet_locator_bar | packet_party_changed | packet_serverbound_data_driven_screen_closed | packet_sync_world_clocks | packet_clientbound_attribute_layer_sync | packet_primitive_shapes | packet_server_store_info | packet_server_presence_info | packet_clientbound_update_sound_data | packet_send_party_destination_cookie | packet_party_destination_cookie_response | packet_set_player_furnace_options | packet_record_started | packet_clientbound_matchmaking_state | packet_serverbound_stonecutter_set_recipe | packet_clientbound_stonecutter_set_recipe | packet_serverbound_matchmaking_cancel | packet_set_passenger_of_block | packet_serverbound_cursor_item_drag | packet_clientbound_play_audio_content | packet_serverbound_register_audio_content | undefined;
	};
	/**
	 * load the packet map file (auto-generated)
	 * # Login Sequence
	 * The login process is as follows:
	 * 
	 * * C→S: [Login](#packet_login)
	 * * S→C: [Server To Client Handshake](#packet_server_to_client_handshake)
	 * * C→S: [Client To Server Handshake](#packet_client_to_server_handshake)
	 * * S→C: [Play Status (Login success)](#packet_play_status)
	 * * To spawn, the following packets should be sent, in order, after the ones above:
	 * * S→C: [Resource Packs Info](#packet_resource_packs_info)
	 * * C→S: [Resource Pack Client Response](#packet_resource_pack_client_response)
	 * * S→C: [Resource Pack Stack](#packet_resource_pack_stack)
	 * * C→S: [Resource Pack Client Response](#packet_resource_pack_client_response)
	 * * S→C: [Start Game](#packet_start_game)
	 * * S→C: [Item Registry](#packet_item_registry)
	 * * S→C: [Creative Content](#packet_creative_content)
	 * * S→C: [Biome Definition List](#packet_biome_definition_list)
	 * * S→C: [Chunks](#packet_level_chunk)
	 * * S→C: [Play Status (Player spawn)](#packet_play_status)
	 * 
	 * If there are no resource packs being sent, a Resource Pack Stack can be sent directly
	 * after Resource Packs Info to avoid the client responses.
	 * 
	 * ===
	 */
	export type packet_login = {
		/** Protocol version (Big Endian!) */
		protocol_version: number;
		/** The structure of the login tokens has changed in 1.21.90. The encapsulated data is now a JSON object with a stringified `Certificate`. */
		tokens?: LoginTokens | undefined;
	};
	export type LoginTokens = {
		/** JSON array of JWT data: contains the display name, UUID and XUID It should be signed by the Mojang public key For 1.21.90+, the 'identity' field is a Little-Endian length-prefixed JSON-encoded string. This JSON object must contain a 'Certificate' key, whose value is a *stringified* JSON object that holds the actual JWT 'chain' array. */
		identity: LittleString;
		/** JWT containing skin and other client data. */
		client: LittleString;
	};
	export type packet_play_status = {
		status: "login_success" | "failed_client" | "failed_spawn" | "player_spawn" | "failed_invalid_tenant" | "failed_vanilla_edu" | "failed_edu_vanilla" | "failed_server_full" | number | "failed_editor_vanilla_mismatch" | "failed_vanilla_editor_mismatch";
	};
	export type packet_server_to_client_handshake = {
		/** Contains the salt to complete the Diffie-Hellman key exchange */
		token: string;
	};
	/**
	 * Sent by the client in response to a Server To Client Handshake packet
	 * sent by the server. It is the first encrypted packet in the login handshake
	 * and serves as a confirmation that encryption is correctly initialized client side.
	 * It has no fields.
	 */
	export type packet_client_to_server_handshake = Record<string, never>;
	export type packet_disconnect = {
		hide_disconnect_reason: boolean;
		message?: string | undefined;
		/** Versions: 1.20.40 – 1.26.60 */
		reason?: DisconnectFailReason | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		filtered_message?: string | undefined;
	};
	export type packet_resource_packs_info = {
		/** If the resource pack requires the client accept it. */
		must_accept: boolean;
		/** If scripting is enabled. */
		has_scripts: boolean;
		/** Versions: 1.16.201 – 1.21.20 */
		behaviour_packs?: BehaviourPackInfos | undefined;
		/** A list of resource packs that the client needs to download before joining the server. The order of these resource packs is not relevant in this packet. It is however important in the Resource Pack Stack packet. */
		texture_packs: TexturePackInfos;
		/** Versions: 1.17.10 – 1.21.20 */
		force_server_packs?: boolean | undefined;
		/** Versions: 1.20.30 – 1.21.30 */
		resource_pack_links?: {
			id: string;
			url: string;
		}[] | undefined;
		/** HasAddons specifies if any of the resource packs contain addons in them. If set to true, only clients that support addons will be able to download them. Versions: 1.20.71 – 1.26.60 */
		has_addons?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.60 */
		world_template?: {
			/** WorldTemplateUUID is teh UUID of the template that has been used to generate the world. Templates can be downloaded from the marketplace or installed via '.mctemplate' files. If the world was not generated from a template, this field is empty. */
			uuid: string;
			/** WorldTemplateVersion is the version of the world template that has been used to generate the world. If the world was not generated from a template, this field is empty. */
			version: string;
		} | undefined;
		/** ForceDisableVibrantVisuals specifies if the vibrant visuals feature should be forcibly disabled on the server. If set to true, the server will ensure that vibrant visuals are not enabled, regardless of the client's settings. Versions: 1.21.90 – 1.26.60 */
		disable_vibrant_visuals?: boolean | undefined;
	};
	export type packet_resource_pack_stack = {
		/** If the resource pack must be accepted for the player to join the server. */
		must_accept: boolean;
		/** Versions: 1.16.201 – 1.21.124 */
		behavior_packs?: ResourcePackIdVersions | undefined;
		/** [inline] */
		resource_packs: ResourcePackIdVersions;
		game_version: string;
		experiments: Experiments;
		experiments_previously_used: boolean;
		/** Versions: 1.20.80 – 1.26.60 */
		has_editor_packs?: boolean | undefined;
	};
	export type packet_resource_pack_client_response = {
		/** As of 1.26.40 the status is an unsigned varint and no longer includes the 'none' entry. It is followed by the same status as a string, and the pack IDs are only written for 'send_packs'. */
		response_status: "none" | "refused" | "send_packs" | "have_all_packs" | "completed" | number;
		/** All of the pack IDs. */
		resourcepackids?: ResourcePackIds | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		response_status_name?: string | undefined;
	};
	/**
	 * Sent by the client to the server to send chat messages, and by the server to the client
	 * to forward or send messages, which may be chat, popups, tips etc.
	 * # https://github.com/pmmp/PocketMine-MP/blob/a43b46a93cb127f037c879b5d8c29cda251dd60c/src/pocketmine/network/mcpe/protocol/TextPacket.php
	 * # https://github.com/Sandertv/gophertunnel/blob/05ac3f843dd60d48b9ca0ab275cda8d9e85d8c43/minecraft/protocol/packet/text.go
	 */
	export type packet_text = {
		/** TextType is the type of the text sent. */
		type: "raw" | "chat" | "translation" | "popup" | "jukebox_popup" | "tip" | "system" | "whisper" | "announcement" | "json_whisper" | "json" | number | "json_announcement";
		/** NeedsTranslation specifies if any of the messages need to be translated. */
		needs_translation: boolean;
		source_name?: string | undefined;
		message?: string | undefined;
		parameters?: string[] | undefined;
		xuid: string;
		platform_chat_id: string;
		/** Versions: 1.21.0 – 1.26.60 */
		filtered_message?: string | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		category?: "message_only" | "authored" | "parameters" | number | undefined;
		/** Versions: 1.21.130 */
		raw?: string | undefined;
		/** Versions: 1.21.130 */
		tip?: string | undefined;
		/** Versions: 1.21.130 */
		system_message?: string | undefined;
		/** Versions: 1.21.130 */
		text_object_whisper?: string | undefined;
		/** Versions: 1.21.130 */
		text_object_announcement?: string | undefined;
		/** Versions: 1.21.130 */
		text_object?: string | undefined;
		/** Versions: 1.21.130 */
		chat?: string | undefined;
		/** Versions: 1.21.130 */
		whisper?: string | undefined;
		/** Versions: 1.21.130 */
		announcement?: string | undefined;
		/** Versions: 1.21.130 */
		translate?: string | undefined;
		/** Versions: 1.21.130 */
		popup?: string | undefined;
		/** Versions: 1.21.130 */
		jukebox_popup?: string | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		has_filtered_message?: boolean | undefined;
	};
	/**
	 * For additional information and examples of all the chat types above, see here: https://imgur.com/a/KhcFscg
	 * Sent by the server to update the current time client-side. The client actually advances time
	 * client-side by itself, so this packet does not need to be sent each tick. It is merely a means
	 * of synchronizing time between server and client.
	 */
	export type packet_set_time = {
		/** Time is the current time. The time is not limited to 24000 (time of day), but continues progressing after that. */
		time: number;
	};
	/**
	 * Sent by the server to send information about the world the player will be spawned in.
	 */
	export type packet_start_game = {
		/** The unique ID of the player. The unique ID is a value that remains consistent across different sessions of the same world, but most unofficial servers simply fill the runtime ID of the entity out for this field. */
		entity_id: bigint;
		/** The runtime ID of the player. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_entity_id: bigint;
		/** PlayerGameMode is the game mode the player currently has. It is a value from 0-4, with 0 being survival mode, 1 being creative mode, 2 being adventure mode, 3 being survival spectator and 4 being creative spectator. This field may be set to 5 to make the client fall back to the game mode set in the WorldGameMode field. */
		player_gamemode: GameMode;
		/** Versions: 1.16.201 */
		spawn?: vec3f | undefined;
		/** The pitch and yaw of the player */
		rotation: vec2f;
		/** The seed used to generate the world. */
		seed: number | Int64;
		biome_type: number;
		biome_name: string;
		/** Dimension is the ID of the dimension that the player spawns in. It is a value from 0-2, with 0 being the overworld, 1 being the nether and 2 being the end. */
		dimension: number | "overworld" | "nether" | "end";
		/** Generator is the generator used for the world. It is a value from 0-4, with 0 being old limited worlds, 1 being infinite worlds, 2 being flat worlds, 3 being nether worlds and 4 being end worlds. A value of 0 will actually make the client stop rendering chunks you send beyond the world limit. As of 1.21.80, protocol.PlayerMovementModeServer is the minimum requirement for MovementType. */
		generator: number;
		/** The world game mode that a player gets when it first spawns in the world. It is shown in the settings and is used if the Player Gamemode is set to 5. */
		world_gamemode: GameMode;
		/** Difficulty is the difficulty of the world. It is a value from 0-3, with 0 being peaceful, 1 being easy, 2 being normal and 3 being hard. */
		difficulty: number;
		/** The block on which the world spawn of the world. This coordinate has no effect on the place that the client spawns, but it does have an effect on the direction that a compass poInts. */
		spawn_position: BlockCoordinates;
		/** Defines if achievements are disabled in the world. The client crashes if this value is set to true while the player's or the world's game mode is creative, and it's recommended to simply always set this to false as a server. */
		achievements_disabled: boolean;
		/** The time at which the day cycle was locked if the day cycle is disabled using the respective game rule. The client will maIntain this time as Boolean as the day cycle is disabled. */
		day_cycle_stop_time: number;
		/** Some Minecraft: Education Edition field that specifies what 'region' the world was from, with 0 being None, 1 being RestOfWorld, and 2 being China. The actual use of this field is unknown. As of 1.26.40 this is an unsigned varint. */
		edu_offer: number;
		/** Specifies if the world has education edition features enabled, such as the blocks or entities specific to education edition. */
		edu_features_enabled: boolean;
		edu_product_uuid: string;
		/** The level specifying the Intensity of the rain falling. When set to 0, no rain falls at all. */
		rain_level: number;
		lightning_level: number;
		/** The level specifying the Intensity of the thunder. This may actually be set independently from the rain level, meaning dark clouds can be produced without rain. */
		has_confirmed_platform_locked_content: boolean;
		/** Specifies if the world is a multi-player game. This should always be set to true for servers. */
		is_multiplayer: boolean;
		/** Specifies if LAN broadcast was Intended to be enabled for the world. */
		broadcast_to_lan: boolean;
		/** The mode used to broadcast the joined game across XBOX Live. */
		xbox_live_broadcast_mode: number;
		/** The mode used to broadcast the joined game across the platform. */
		platform_broadcast_mode: number;
		/** If commands are enabled for the player. It is recommended to always set this to true on the server, as setting it to false means the player cannot, under any circumstance, use a command. */
		enable_commands: boolean;
		/** Specifies if the texture pack the world might hold is required, meaning the client was forced to download it before joining. */
		is_texturepacks_required: boolean;
		/** Defines game rules currently active with their respective values. The value of these game rules may be either 'bool', 'Int32' or 'Float32'. Some game rules are server side only, and don't necessarily need to be sent to the client. As of 1.26.40 StartGame uses the same game rule encoding as the rest of the protocol (int values are little endian ints instead of varints). */
		gamerules: GameRules | GameRuleVarint[] | GameRuleI32[];
		experiments: Experiments;
		experiments_previously_used: boolean;
		/** Specifies if the world had the bonus map setting enabled when generating it. It does not have any effect client-side. */
		bonus_chest: boolean;
		/** Specifies if the world has the start with map setting enabled, meaning each joining player obtains a map. This should always be set to false, because the client obtains a map all on its own accord if this is set to true. */
		map_enabled: boolean;
		/** The permission level of the player. It is a value from 0-3, with 0 being visitor, 1 being member, 2 being operator and 3 being custom. */
		permission_level: number | PermissionLevel;
		/** The radius around the player in which chunks are ticked. Most servers set this value to a fixed number, as it does not necessarily affect anything client-side. */
		server_chunk_tick_range: number;
		/** Specifies if the texture pack of the world is locked, meaning it cannot be disabled from the world. This is typically set for worlds on the marketplace that have a dedicated texture pack. */
		has_locked_behavior_pack: boolean;
		/** Specifies if the texture pack of the world is locked, meaning it cannot be disabled from the world. This is typically set for worlds on the marketplace that have a dedicated texture pack. */
		has_locked_resource_pack: boolean;
		/** Specifies if the world from the server was from a locked world template. For servers this should always be set to false. */
		is_from_locked_world_template: boolean;
		msa_gamertags_only: boolean;
		/** Specifies if the world from the server was from a locked world template. For servers this should always be set to false. */
		is_from_world_template: boolean;
		/** Specifies if the world was a template that locks all settings that change properties above in the settings GUI. It is recommended to set this to true for servers that do not allow things such as setting game rules through the GUI. */
		is_world_template_option_locked: boolean;
		/** A hack that Mojang put in place to preserve backwards compatibility with old villagers. The his never actually read though, so it has no functionality. */
		only_spawn_v1_villagers: boolean;
		/** The version of the game from which Vanilla features will be used. The exact function of this field isn't clear. */
		game_version: string;
		limited_world_width: number;
		limited_world_length: number;
		is_new_nether: boolean;
		experimental_gameplay_override: boolean;
		/** A base64 encoded world ID that is used to identify the world. */
		level_id: string;
		/** The name of the world that the player is joining. Note that this field shows up above the player list for the rest of the game session, and cannot be changed. Setting the server name to this field is recommended. */
		world_name: string;
		/** A UUID specific to the premium world template that might have been used to generate the world. Servers should always fill out an empty String for this. */
		premium_world_template_id: string;
		/** Specifies if the world was a trial world, meaning features are limited and there is a time limit on the world. */
		is_trial: boolean;
		/** Versions: 1.16.201 – 1.21.80 */
		movement_authority?: "client" | "server" | "server_v2_rewind" | number | "server_with_rewind" | undefined;
		current_tick: Int64;
		enchantment_seed: number;
		/** Versions: 1.16.201 – 1.16.210 */
		block_palette?: BlockPalette | undefined;
		/** Versions: 1.16.201 – 1.21.50 */
		itemstates?: Itemstates | undefined;
		multiplayer_correlation_id: string;
		server_authoritative_inventory: boolean;
		/** The spawn position of the player in the world. In servers this is often the same as the world's spawn position found below. Versions: 1.16.210 – 1.26.60 */
		player_position?: vec3f | undefined;
		/** RewindHistorySize is the amount of history to keep at maximum Versions: 1.16.210 – 1.26.60 */
		rewind_history_size?: number | undefined;
		/** ServerAuthoritativeBlockBreaking specifies if block breaking should be sent through packet.PlayerAuthInput or not. This field is somewhat redundant as it is always enabled if server authoritative movement is enabled. Versions: 1.16.210 – 1.26.60 */
		server_authoritative_block_breaking?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		block_properties?: BlockProperties | undefined;
		/** Versions: 1.17.0 – 1.26.60 */
		engine?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		edu_resource_uri?: EducationSharedResourceURI | undefined;
		/** Versions: 1.18.0 – 1.18.30 */
		block_pallete_checksum?: Int64 | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		property_data?: NBT | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		block_pallette_checksum?: Int64 | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		world_template_id?: string | undefined;
		/** Versions: 1.19.10 – 1.20.10 */
		editor_world?: boolean | undefined;
		/** PersonaDisabled is true if persona skins are disabled for the current game session. Versions: 1.19.20 – 1.26.60 */
		persona_disabled?: boolean | undefined;
		/** CustomSkinsDisabled is true if custom skins are disabled for the current game session. Versions: 1.19.20 – 1.26.60 */
		custom_skins_disabled?: boolean | undefined;
		/** ChatRestrictionLevel specifies the level of restriction on in-game chat. Versions: 1.19.20 – 1.26.60 */
		chat_restriction_level?: "none" | "dropped" | "disabled" | number | undefined;
		/** DisablePlayerInteractions is true if the client should ignore other players when interacting with the world. Versions: 1.19.20 – 1.26.60 */
		disable_player_interactions?: boolean | undefined;
		/** Versions: 1.19.20 – 1.26.60 */
		client_side_generation?: boolean | undefined;
		/** EmoteChatMuted specifies if players will be sent a chat message when using certain emotes. Versions: 1.19.60 – 1.26.60 */
		emote_chat_muted?: boolean | undefined;
		/** Whether the world was created in editor mode Versions: 1.19.80 – 1.26.60 */
		created_in_editor?: boolean | undefined;
		/** Whether the world was exported from editor mode Versions: 1.19.80 – 1.26.60 */
		exported_from_editor?: boolean | undefined;
		/** Versions: 1.19.80 – 1.26.60 */
		block_network_ids_are_hashes?: boolean | undefined;
		/** Versions: 1.20.0 – 1.26.60 */
		server_controlled_sound?: boolean | undefined;
		/** EditorWorldType is a value to dictate the type of editor mode, a special mode recently introduced adding "powerful tools for editing worlds, intended for experienced creators." Versions: 1.20.30 – 1.26.60 */
		editor_world_type?: "not_editor" | "project" | "test_level" | number | "realms_upload" | undefined;
		/** Specifies if the game is locked to "hardcore" mode or not, meaning the world will be unplayable after player dies in survival game mode. Persists even after switching player or world game modes. Versions: 1.20.80 – 1.26.60 */
		hardcore?: boolean | undefined;
		/** Versions: 1.21.0 – 1.26.60 */
		server_identifier?: string | undefined;
		/** Versions: 1.21.0 – 1.26.60 */
		world_identifier?: string | undefined;
		/** Versions: 1.21.0 – 1.26.60 */
		scenario_identifier?: string | undefined;
		/** Versions: 1.21.90 – 1.26.60 */
		owner_identifier?: string | undefined;
		/** Versions: 1.21.100 – 1.21.124 */
		tick_death_systems?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		has_server_join_info?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		server_join_info?: ServerJoinInformation | undefined;
		/** ServerEditorConnectionPolicy controls the editor connection policy. Versions: 1.26.30 – 1.26.60 */
		server_editor_connection_policy?: number | undefined;
		/** AllowAnonymousBlockDropsInEditorWorlds specifies if anonymous block Versions: 1.26.30 – 1.26.60 */
		allow_anonymous_block_drops_in_editor_worlds?: boolean | undefined;
		/** Versions: 1.26.30 */
		is_chat_logging?: boolean | undefined;
		/** Versions: 1.26.60 */
		editor_level_migration_version?: "legacy" | "editor_achievements" | number | undefined;
	};
	export type packet_add_player = {
		/** UUID is the UUID of the player. It is the same UUID that the client sent in the Login packet at the start of the session. A player with this UUID must exist in the player list (built up using the Player List packet) for it to show up in-game. */
		uuid: string;
		/** Username is the name of the player. This username is the username that will be set as the initial name tag of the player. */
		username: string;
		/** Versions: 1.16.201 – 1.18.11 */
		entity_id_self?: bigint | undefined;
		/** Versions: 1.16.201 – 1.19.1 */
		runtime_entity_id?: number | bigint | undefined;
		/** An identifier only set for particular platforms when chatting (presumably only for Nintendo Switch). It is otherwise an empty string, and is used to decide which players are able to chat with each other. */
		platform_chat_id: string;
		/** Versions: 1.16.201 – 1.16.210 */
		x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		z?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_z?: number | undefined;
		/** Pitch is the vertical rotation of the player. Facing straight forward yields a pitch of 0. Pitch is measured in degrees. */
		pitch: number;
		/** Yaw is the horizontal rotation of the player. Yaw is also measured in degrees. */
		yaw: number;
		/** HeadYaw is the same as Yaw, except that it applies specifically to the head of the player. A different value for HeadYaw than Yaw means that the player will have its head turned. */
		head_yaw: number;
		/** HeldItem is the item that the player is holding. The item is shown to the viewer as soon as the player itself shows up. Needless to say that this field is rather pointless, as additional packets still must be sent for armour to show up. */
		held_item: Item | ItemV4;
		/** EntityMetadata is a map of entity metadata, which includes flags and data properties that alter in particular the way the player looks. Flags include ones such as 'on fire' and 'sprinting'. The metadata values are indexed by their property key. */
		metadata: MetadataDictionary;
		/** Versions: 1.16.201 – 1.19.1 */
		flags?: number | undefined;
		command_permission: number | CommandPermissionLevel;
		/** Versions: 1.16.201 – 1.19.1 */
		action_permissions?: number | undefined;
		permission_level: number | PermissionLevel;
		/** Versions: 1.16.201 – 1.19.1 */
		custom_stored_permissions?: number | undefined;
		/** Versions: 1.16.201 – 1.19.1 */
		user_id?: Int64 | undefined;
		/** EntityLinks is a list of entity links that are currently active on the player. These links alter the way the player shows up when first spawned in terms of it shown as riding an entity. Setting these links is important for new viewers to see the player is riding another entity. */
		links: Links;
		/** DeviceID is the device ID set in one of the files found in the storage of the device of the player. It may be changed freely, so it should not be relied on for anything. */
		device_id: string;
		/** BuildPlatform is the build platform/device OS of the player that is about to be added, as it sent in the Login packet when joining. */
		device_os?: number | DeviceOS | undefined;
		/** Position is the position to spawn the player on. If the player is on a distance that the viewer cannot see it, the player will still show up if the viewer moves closer. Versions: 1.16.220 – 1.26.60 */
		position?: vec3f | undefined;
		/** Velocity is the initial velocity the player spawns with. This velocity will initiate client side movement of the player. Versions: 1.16.220 – 1.26.60 */
		velocity?: vec3f | undefined;
		/** Versions: 1.18.30 – 1.19.1 */
		unique_entity_id?: bigint | undefined;
		/** GameType is the game type of the player. If set to GameTypeSpectator, the player will not be shown to viewers. Versions: 1.18.30 – 1.26.60 */
		gamemode?: GameMode | undefined;
		/** The runtime ID of the player. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.19.10 – 1.26.60 */
		runtime_id?: bigint | undefined;
		/** The unique ID of the player. The unique ID is a value that remains consistent across different sessions of the same world, but most unoffical servers simply fill the runtime ID of the player out for this field. Versions: 1.19.10 – 1.26.60 */
		unique_id?: Int64 | undefined;
		/** AbilityLayer represents the abilities of a specific layer, such as the base layer or the spectator layer. Versions: 1.19.10 – 1.26.60 */
		abilities?: AbilityLayers[] | undefined;
		/** EntityProperties holds lists of entity properties that define specific attributes of an entity. As of v1.19.40, the vanilla server does not use these properties, however they are still supported by the protocol. Versions: 1.19.40 – 1.26.60 */
		properties?: EntityProperties | undefined;
		/** Versions: 1.26.60 */
		passenger_of_block?: PassengerOfBlockData | undefined;
	};
	export type packet_add_entity = {
		/** Versions: 1.16.201 – 1.19.1 */
		entity_id_self?: bigint | undefined;
		/** Versions: 1.16.201 – 1.19.1 */
		runtime_entity_id?: number | bigint | undefined;
		/** EntityType is the string entity type of the entity, for example 'minecraft:skeleton'. A list of these entities may be found online. */
		entity_type: string;
		/** Versions: 1.16.201 – 1.16.210 */
		x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		z?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_z?: number | undefined;
		/** Pitch is the vertical rotation of the entity. Facing straight forward yields a pitch of 0. Pitch is measured in degrees. */
		pitch: number;
		/** Yaw is the horizontal rotation of the entity. Yaw is also measured in degrees. */
		yaw: number;
		/** HeadYaw is the same as Yaw, except that it applies specifically to the head of the entity. A different value for HeadYaw than Yaw means that the entity will have its head turned. */
		head_yaw: number;
		/** Attributes is a slice of attributes that the entity has. It includes attributes such as its health, movement speed, etc. */
		attributes: EntityAttributes;
		/** EntityMetadata is a map of entity metadata, which includes flags and data properties that alter in particular the way the entity looks. Flags include ones such as 'on fire' and 'sprinting'. The metadata values are indexed by their property key. */
		metadata: MetadataDictionary;
		/** EntityLinks is a list of entity links that are currently active on the entity. These links alter the way the entity shows up when first spawned in terms of it shown as riding an entity. Setting these links is important for new viewers to see the entity is riding another entity. */
		links: Links;
		/** Position is the position to spawn the entity on. If the entity is on a distance that the player cannot see it, the entity will still show up if the player moves closer. Versions: 1.16.220 – 1.26.60 */
		position?: vec3f | undefined;
		/** Velocity is the initial velocity the entity spawns with. This velocity will initiate client side movement of the entity. Versions: 1.16.220 – 1.26.60 */
		velocity?: vec3f | undefined;
		/** EntityUniqueID is the unique ID of the entity. The unique ID is a value that remains consistent across different sessions of the same world, but most servers simply fill the runtime ID of the entity out for Versions: 1.19.10 – 1.26.60 */
		unique_id?: bigint | undefined;
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.19.10 – 1.26.60 */
		runtime_id?: bigint | undefined;
		/** BodyYaw is the same as Yaw, except that it applies specifically to the body of the entity. A different value for BodyYaw than HeadYaw means that the entity will have its body turned, although it is unclear what the difference between BodyYaw and Yaw is. Versions: 1.19.10 – 1.26.60 */
		body_yaw?: number | undefined;
		/** EntityProperties holds lists of entity properties that define specific attributes of an entity. As of v1.19.40, the vanilla server does not use these properties, however they are still supported by the protocol. Versions: 1.19.40 – 1.26.60 */
		properties?: EntityProperties | undefined;
		/** Versions: 1.26.60 */
		passenger_of_block?: PassengerOfBlockData | undefined;
	};
	export type packet_remove_entity = {
		entity_id_self: bigint;
	};
	export type packet_add_item_entity = {
		entity_id_self: bigint;
		runtime_entity_id: number | bigint;
		item: Item | ItemV4;
		/** Versions: 1.16.201 – 1.16.210 */
		x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		z?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_z?: number | undefined;
		metadata: MetadataDictionary;
		is_from_fishing: boolean;
		/** Versions: 1.16.220 – 1.26.60 */
		position?: vec3f | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		velocity?: vec3f | undefined;
	};
	export type packet_take_item_entity = {
		runtime_entity_id: number | bigint;
		target: number;
	};
	/**
	 * MoveActorAbsolute is sent by the server to move an entity to an absolute position. It is typically used
	 * for movements where high accuracy isn't needed, such as for long range teleporting.
	 */
	export type packet_move_entity = {
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_entity_id: number | bigint;
		/** Flags is a combination of flags that specify details of the movement. It is a combination of the flags above. */
		flags: number;
		/** Position is the position to spawn the entity on. If the entity is on a distance that the player cannot see it, the entity will still show up if the player moves closer. */
		position: vec3f;
		/** Rotation is a Vec3 holding the X, Y and Z rotation of the entity after the movement. This is a Vec3 for the reason that projectiles like arrows don't have yaw/pitch, but do have roll. */
		rotation: Rotation;
	};
	/**
	 * MovePlayer is sent by players to send their movement to the server, and by the server to update the
	 * movement of player entities to other players.
	 */
	export type packet_move_player = {
		/** EntityRuntimeID is the runtime ID of the player. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_id: number;
		/** Position is the position to spawn the player on. If the player is on a distance that the viewer cannot see it, the player will still show up if the viewer moves closer. */
		position: vec3f;
		/** Pitch is the vertical rotation of the player. Facing straight forward yields a pitch of 0. Pitch is measured in degrees. */
		pitch: number;
		/** Yaw is the horizontal rotation of the player. Yaw is also measured in degrees */
		yaw: number;
		/** HeadYaw is the same as Yaw, except that it applies specifically to the head of the player. A different value for HeadYaw than Yaw means that the player will have its head turned */
		head_yaw: number;
		/** Mode is the mode of the movement. It specifies the way the player's movement should be shown to other players. It is one of the constants below. */
		mode: "normal" | "reset" | "teleport" | "rotation" | number;
		/** OnGround specifies if the player is considered on the ground. Note that proxies or hacked clients could fake this to always be true, so it should not be taken for granted. */
		on_ground: boolean;
		/** RiddenEntityRuntimeID is the runtime ID of the entity that the player might currently be riding. If not riding, this should be left 0. */
		ridden_runtime_id: number;
		teleport?: {
			cause: "unknown" | "projectile" | "chorus_fruit" | "command" | "behavior" | number;
			source_entity_type: LegacyEntityType;
		} | undefined;
		tick: bigint;
	};
	/**
	 * Removed in 1.21.80
	 */
	export type packet_rider_jump = {
		jump_strength: number;
	};
	/**
	 * UpdateBlock is sent by the server to update a block client-side, without resending the entire chunk that
	 * the block is located in. It is particularly useful for small modifications like block breaking/placing.
	 */
	export type packet_update_block = {
		/** Versions: 1.16.201 */
		coordinates?: BlockCoordinates | undefined;
		/** NewBlockRuntimeID is the runtime ID of the block that is placed at Position after sending the packet to the client. */
		block_runtime_id: number;
		/** Versions: 1.16.201 */
		block_priority?: number | undefined;
		/** Versions: 1.16.201 */
		storage?: number | undefined;
		/** Position is the block position at which a block is updated. Versions: 1.16.210 – 1.26.60 */
		position?: BlockCoordinates | undefined;
		/** Flags is a combination of flags that specify the way the block is updated client-side. It is a combination of the flags above, but typically sending only the BlockUpdateNetwork flag is sufficient. Versions: 1.16.210 – 1.26.60 */
		flags?: UpdateBlockFlags | undefined;
		/** Layer is the world layer on which the block is updated. For most blocks, this is the first layer, as that layer is the default layer to place blocks on, but for blocks inside of each other, this differs. Versions: 1.16.210 – 1.26.60 */
		layer?: number | undefined;
	};
	export type packet_add_painting = {
		entity_id_self: bigint;
		runtime_entity_id: number | bigint;
		coordinates: BlockCoordinates | vec3f;
		direction: number;
		title: string;
	};
	/**
	 * TickSync is sent by the client and the server to maintain a synchronized, server-authoritative tick between
	 * the client and the server. The client sends this packet first, and the server should reply with another one
	 * of these packets, including the response time.
	 */
	export type packet_tick_sync = {
		/** ClientRequestTimestamp is the timestamp on which the client sent this packet to the server. The server should fill out that same value when replying. The ClientRequestTimestamp is always 0 */
		request_time: Int64;
		/** ServerReceptionTimestamp is the timestamp on which the server received the packet sent by the client. When the packet is sent by the client, this value is 0. ServerReceptionTimestamp is generally the current tick of the server. It isn't an actual timestamp, as the field implies */
		response_time: Int64;
	};
	export type packet_level_sound_event_old = {
		sound_id: number;
		position: vec3f;
		block_id: number;
		entity_type: number;
		is_baby_mob: boolean;
		is_global: boolean;
	};
	/**
	 * TODO: Check and verify old versions
	 */
	export type packet_level_event = {
		event: "sound_click" | "sound_click_fail" | "sound_shoot" | "sound_door" | "sound_fizz" | "sound_ignite" | "sound_ghast" | "sound_ghast_shoot" | "sound_blaze_shoot" | "sound_door_bump" | "sound_door_crash" | "sound_enderman_teleport" | "sound_anvil_break" | "sound_anvil_use" | "sound_anvil_fall" | "sound_pop" | "sound_portal" | "sound_itemframe_add_item" | "sound_itemframe_remove" | "sound_itemframe_place" | "sound_itemframe_remove_item" | "sound_itemframe_rotate_item" | "sound_camera" | "sound_orb" | "sound_totem" | "sound_armor_stand_break" | "sound_armor_stand_hit" | "sound_armor_stand_fall" | "sound_armor_stand_place" | "particle_shoot" | "particle_destroy" | "particle_splash" | "particle_eye_despawn" | "particle_spawn" | "guardian_curse" | "particle_block_force_field" | "particle_projectile_hit" | "particle_enderman_teleport" | "particle_punch_block" | "start_rain" | "start_thunder" | "stop_rain" | "stop_thunder" | "pause_game" | "pause_game_no_screen" | "set_game_speed" | "redstone_trigger" | "cauldron_explode" | "cauldron_dye_armor" | "cauldron_clean_armor" | "cauldron_fill_potion" | "cauldron_take_potion" | "cauldron_fill_water" | "cauldron_take_water" | "cauldron_add_dye" | "cauldron_clean_banner" | "block_start_break" | "block_stop_break" | "set_data" | "players_sleeping" | "add_particle_mask" | number | "pointed_dripstone_land" | "dye_used" | "ink_sack_used" | "particle_crop_growth" | "particle_guardian_curse" | "particle_death_smoke" | "particle_dragon_egg_teleport" | "particle_crop_eaten" | "particle_critical" | "particle_bubble" | "particle_evaporate" | "particle_destroy_armor_stand" | "particle_breaking_egg" | "particle_destroy_egg" | "particle_evaporate_water" | "particle_destroy_block_no_sound" | "particle_knockback_roar" | "particle_teleport_trail" | "particle_point_cloud" | "particle_explosion" | "particle_block_explosion" | "particle_vibration_signal" | "particle_dripstone_drip" | "particle_fizz_effect" | "particle_wax_on" | "particle_wax_off" | "particle_scrape" | "particle_electric_spark" | "add_particle_bubble" | "add_particle_bubble_manual" | "add_particle_critical" | "add_particle_block_force_field" | "add_particle_smoke" | "add_particle_explode" | "add_particle_evaporation" | "add_particle_flame" | "add_particle_candle_flame" | "add_particle_lava" | "add_particle_large_smoke" | "add_particle_redstone" | "add_particle_rising_red_dust" | "add_particle_item_break" | "add_particle_snowball_poof" | "add_particle_huge_explode" | "add_particle_huge_explode_seed" | "add_particle_mob_flame" | "add_particle_heart" | "add_particle_terrain" | "add_particle_town_aura" | "add_particle_portal" | "add_particle_water_splash" | "add_particle_water_splash_manual" | "add_particle_water_wake" | "add_particle_drip_water" | "add_particle_drip_lava" | "add_particle_drip_honey" | "add_particle_stalactite_drip_water" | "add_particle_stalactite_drip_lava" | "add_particle_falling_dust" | "add_particle_mob_spell" | "add_particle_mob_spell_ambient" | "add_particle_mob_spell_instantaneous" | "add_particle_ink" | "add_particle_slime" | "add_particle_rain_splash" | "add_particle_villager_angry" | "add_particle_villager_happy" | "add_particle_enchantment_table" | "add_particle_tracking_emitter" | "add_particle_note" | "add_particle_witch_spell" | "add_particle_carrot" | "add_particle_mob_appearance" | "add_particle_end_rod" | "add_particle_dragons_breath" | "add_particle_spit" | "add_particle_totem" | "add_particle_food" | "add_particle_fireworks_starter" | "add_particle_fireworks_spark" | "add_particle_fireworks_overlay" | "add_particle_balloon_gas" | "add_particle_colored_flame" | "add_particle_sparkler" | "add_particle_conduit" | "add_particle_bubble_column_up" | "add_particle_bubble_column_down" | "add_particle_sneeze" | "add_particle_shulker_bullet" | "add_particle_bleach" | "add_particle_dragon_destroy_block" | "add_particle_mycelium_dust" | "add_particle_falling_red_dust" | "add_particle_campfire_smoke" | "add_particle_tall_campfire_smoke" | "add_particle_dragon_breath_fire" | "add_particle_dragon_breath_trail" | "add_particle_blue_flame" | "add_particle_soul" | "add_particle_obsidian_tear" | "add_particle_portal_reverse" | "add_particle_snowflake" | "add_particle_vibration_signal" | "add_particle_sculk_sensor_redstone" | "add_particle_spore_blossom_shower" | "add_particle_spore_blossom_ambient" | "add_particle_wax" | "add_particle_electric_spark" | "particle_turtle_egg" | "particle_sculk_shriek" | "sculk_catalyst_bloom" | "sleeping_players" | "sculk_charge" | "sculk_charge_pop" | "sonic_explosion" | "block_break_speed" | "particle_punch_block_down" | "particle_punch_block_up" | "particle_punch_block_north" | "particle_punch_block_south" | "particle_punch_block_west" | "particle_punch_block_east" | "dust_plume" | "particle_shoot_white_smoke" | "particle_wind_explosion" | "particle_trial_spawner_detection" | "particle_trial_spawner_spawning" | "particle_trial_spawner_ejecting" | "jump_prevented" | "particle_breeze_wind_explosion" | "animation_vault_activate" | "animation_vault_deactivate" | "animation_vault_eject_item" | "particle_wolf_armor_break" | "animation_spawn_cobweb" | "add_particle_smash_attack_ground_dust" | "add_particle_creaking_heart_trail" | "ominous_item_spawner" | "creaking_crumble" | "pale_oak_leaves" | "eyeblossom_open" | "eyeblossom_close" | "green_flame" | "add_particle_ice_ball_break";
		position: vec3f;
		data: number;
	};
	export type packet_block_event = {
		/** Position is the position of the block that an event occurred at. */
		position: BlockCoordinates;
		/** EventType is the type of the block event. The event type decides the way the event data that follows is used */
		type: "sound" | "change_state" | number;
		/** EventData holds event type specific data. For chests for example, opening the chest means the data must be 1 */
		data: number;
	};
	export type packet_entity_event = {
		runtime_entity_id: number | bigint;
		event_id: "jump" | "hurt_animation" | "death_animation" | "arm_swing" | "stop_attack" | "tame_fail" | "tame_success" | "shake_wet" | "use_item" | "eat_grass_animation" | "fish_hook_bubble" | "fish_hook_position" | "fish_hook_hook" | "fish_hook_tease" | "squid_ink_cloud" | "zombie_villager_cure" | "respawn" | "iron_golem_offer_flower" | "iron_golem_withdraw_flower" | "love_particles" | "villager_angry" | "villager_happy" | "witch_spell_particles" | "firework_particles" | "in_love_particles" | "silverfish_spawn_animation" | "guardian_attack" | "witch_drink_potion" | "witch_throw_potion" | "minecart_tnt_prime_fuse" | "creeper_prime_fuse" | "air_supply_expired" | "player_add_xp_levels" | "elder_guardian_curse" | "agent_arm_swing" | "ender_dragon_death" | "dust_particles" | "arrow_shake" | "eating_item" | "baby_animal_feed" | "death_smoke_cloud" | "complete_trade" | "remove_leash" | "consume_totem" | "player_check_treasure_hunter_achievement" | "entity_spawn" | "dragon_puke" | "item_entity_merge" | "start_swim" | "balloon_pop" | "treasure_hunt" | "agent_summon" | "charged_item" | "fall" | number | "caravan" | "grow_up" | "vibration_detected" | "drink_milk" | "wetness_stop" | "kinetic_damage_dealt" | "hurt_without_receiving_damage";
		data: number;
		/** Versions: 1.26.20 – 1.26.60 */
		fire_at_position?: vec3f | undefined;
	};
	export type packet_mob_effect = {
		runtime_entity_id: number | bigint;
		event_id: "add" | "update" | "remove" | number;
		effect_id: number;
		amplifier: number;
		particles: boolean;
		duration: number;
		/** Versions: 1.20.71 – 1.26.60 */
		tick?: Int64 | bigint | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		ambient?: boolean | undefined;
	};
	export type packet_update_attributes = {
		runtime_entity_id: bigint;
		attributes: PlayerAttributes;
		tick: bigint;
	};
	/**
	 * InventoryTransaction is a packet sent by the client. It essentially exists out of multiple sub-packets,
	 * each of which have something to do with the inventory in one way or another. Some of these sub-packets
	 * directly relate to the inventory, others relate to interaction with the world, that could potentially
	 * result in a change in the inventory.
	 */
	export type packet_inventory_transaction = {
		transaction: Transaction;
	};
	export type packet_mob_equipment = {
		runtime_entity_id: number | bigint;
		item: Item | ItemV4;
		slot: number;
		selected_slot: number;
		/** Versions: 1.16.201 */
		windows_id?: WindowID | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		window_id?: WindowID | undefined;
	};
	export type packet_mob_armor_equipment = {
		runtime_entity_id: number | bigint;
		helmet: Item | ItemV4;
		chestplate: Item | ItemV4;
		leggings: Item | ItemV4;
		boots: Item | ItemV4;
		/** Versions: 1.21.20 – 1.26.60 */
		body?: Item | ItemV4 | undefined;
	};
	/**
	 * Interact is sent by the client when it interacts with another entity in some way. It used to be used for
	 * normal entity and block interaction, but this is no longer the case now.
	 */
	export type packet_interact = {
		/** Action type is the ID of the action that was executed by the player. It is one of the constants that may be found above. */
		action_id: "leave_vehicle" | "mouse_over_entity" | "npc_open" | "open_inventory" | number;
		/** Versions: 1.16.201 */
		target_runtime_entity_id?: number | undefined;
		position?: vec3f | undefined;
		/** TargetEntityRuntimeID is the runtime ID of the entity that the player interacted with. This is empty for the InteractActionOpenInventory action type. Versions: 1.16.210 – 1.26.60 */
		target_entity_id?: bigint | undefined;
		/** Position associated with the ActionType above. Versions: 1.21.130 – 1.26.60 */
		has_position?: boolean | undefined;
	};
	export type packet_block_pick_request = {
		x: number;
		y: number;
		z: number;
		add_user_data: boolean;
		selected_slot: number;
	};
	export type packet_entity_pick_request = {
		runtime_entity_id: Int64;
		selected_slot: number;
		/** WithData is true if the pick request requests the entity metadata. Versions: 1.17.30 – 1.26.60 */
		with_data?: boolean | undefined;
	};
	/**
	 * PlayerAction is sent by the client when it executes any action, for example starting to sprint, swim,
	 * starting the breaking of a block, dropping an item, etc.
	 */
	export type packet_player_action = {
		/** EntityRuntimeID is the runtime ID of the player. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_entity_id: number | bigint;
		/** ActionType is the ID of the action that was executed by the player. It is one of the constants that may be found above. */
		action: "start_break" | "abort_break" | "stop_break" | "get_updated_block" | "drop_item" | "start_sleeping" | "stop_sleeping" | "respawn" | "jump" | "start_sprint" | "stop_sprint" | "start_sneak" | "stop_sneak" | "creative_player_destroy_block" | "dimension_change_ack" | "start_glide" | "stop_glide" | "build_denied" | "continue_break" | "change_skin" | "set_enchatnment_seed" | "swimming" | "stop_swimming" | "start_spin_attack" | "stop_spin_attack" | "ineract_block" | number | Action;
		/** BlockPosition is the position of the target block, if the action with the ActionType set concerned a block. If that is not the case, the block position will be zero. */
		position: BlockCoordinates;
		/** BlockFace is the face of the target block that was touched. If the action with the ActionType set concerned a block. If not, the face is always 0. */
		face: number;
		/** ResultPosition is the position of the action's result. When a UseItemOn action is sent, this is the position of the block clicked, but when a block is placed, this is the position at which the block will be placed. Versions: 1.19.1 – 1.26.60 */
		result_position?: BlockCoordinates | undefined;
	};
	export type packet_hurt_armor = {
		/** Versions: 1.16.201 – 1.17.10 */
		health?: number | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		cause?: number | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		damage?: number | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		armor_slots?: bigint | undefined;
	};
	export type packet_set_entity_data = {
		runtime_entity_id: number | bigint;
		metadata: MetadataDictionary;
		tick: bigint;
		/** EntityProperties holds lists of entity properties that define specific attributes of an entity. As of v1.19.40, the vanilla server does not use these properties, however they are still supported by the protocol. Versions: 1.19.40 – 1.26.60 */
		properties?: EntityProperties | undefined;
	};
	/**
	 * SetActorMotion is sent by the server to change the client-side velocity of an entity. It is usually used
	 * in combination with server-side movement calculation.
	 */
	export type packet_set_entity_motion = {
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_entity_id: number | bigint;
		/** Velocity is the new velocity the entity gets. This velocity will initiate the client-side movement of the entity. */
		velocity: vec3f;
		/** Versions: 1.20.71 – 1.26.60 */
		tick?: bigint | undefined;
	};
	/**
	 * SetActorLink is sent by the server to initiate an entity link client-side, meaning one entity will start
	 * riding another.
	 */
	export type packet_set_entity_link = {
		link: Link;
	};
	export type packet_set_health = {
		health: number;
	};
	export type packet_set_spawn_position = {
		spawn_type: "player" | "world" | number;
		player_position: BlockCoordinates;
		dimension: number;
		world_position: BlockCoordinates;
	};
	export type packet_animate = {
		action_id: "none" | "swing_arm" | "unknown" | "wake_up" | "critical_hit" | "magic_critical_hit" | "row_right" | "row_left" | number;
		runtime_entity_id: bigint;
		/** Versions: 1.16.201 – 1.17.30, 1.18.0 – 1.21.111 */
		boat_rowing_time?: number | undefined;
		/** Data holds an action-specific value whose meaning depends on the animation type. Versions: 1.21.120 – 1.26.60 */
		data?: number | undefined;
		/** Versions: 1.21.120 – 1.21.124 */
		rowing_time?: number | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		has_swing_source?: boolean | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		swing_source?: string | undefined;
		/** Versions: 1.26.60 */
		hand?: "main_hand" | "off_hand" | number | undefined;
	};
	export type packet_respawn = {
		/** Versions: 1.16.201 – 1.16.210 */
		x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		z?: number | undefined;
		state: number;
		runtime_entity_id: number | bigint;
		/** Versions: 1.16.220 – 1.26.60 */
		position?: vec3f | undefined;
	};
	/**
	 * ContainerOpen is sent by the server to open a container client-side. This container must be physically
	 * present in the world, for the packet to have any effect. Unlike Java Edition, Bedrock Edition requires that
	 * chests for example must be present and in range to open its inventory.
	 */
	export type packet_container_open = {
		/** WindowID is the ID representing the window that is being opened. It may be used later to close the container using a ContainerClose packet. */
		window_id: WindowID;
		/** ContainerType is the type ID of the container that is being opened when opening the container at the position of the packet. It depends on the block/entity, and could, for example, be the window type of a chest or a hopper, but also a horse inventory. */
		window_type: WindowType;
		/** ContainerPosition is the position of the container opened. The position must point to a block entity that actually has a container. If that is not the case, the window will not be opened and the packet will be ignored, if a valid ContainerEntityUniqueID has not also been provided. */
		coordinates: BlockCoordinates;
		/** ContainerEntityUniqueID is the unique ID of the entity container that was opened. It is only used if the ContainerType is one that points to an entity, for example a horse. */
		runtime_entity_id: bigint;
	};
	/**
	 * ContainerClose is sent by the server to close a container the player currently has opened, which was opened
	 * using the ContainerOpen packet, or by the client to tell the server it closed a particular container, such
	 * as the crafting grid.
	 */
	export type packet_container_close = {
		/** WindowID is the ID representing the window of the container that should be closed. It must be equal to the one sent in the ContainerOpen packet to close the designated window. */
		window_id: WindowID;
		/** ServerSide determines whether or not the container was force-closed by the server. If this value is not set correctly, the client may ignore the packet and respond with a PacketViolationWarning. */
		server: boolean;
		/** ContainerType is the type ID of the container that is being opened when opening the container at the position of the packet. It depends on the block/entity, and could, for example, be the window type of a chest or a hopper, but also a horse inventory. Versions: 1.21.0 – 1.26.60 */
		window_type?: WindowType | undefined;
	};
	/**
	 * PlayerHotBar is sent by the server to the client. It used to be used to link hot bar slots of the player to
	 * actual slots in the inventory, but as of 1.2, this was changed and hot bar slots are no longer a free
	 * floating part of the inventory.
	 * Since 1.2, the packet has been re-purposed, but its new functionality is not clear.
	 */
	export type packet_player_hotbar = {
		selected_slot: number;
		window_id: WindowID;
		select_slot: boolean;
	};
	/**
	 * InventoryContent is sent by the server to update the full content of a particular inventory. It is usually
	 * sent for the main inventory of the player, but also works for other inventories that are currently opened
	 * by the player.
	 */
	export type packet_inventory_content = {
		/** Versions: 1.16.201 */
		inventory_id?: WindowIDVarint | undefined;
		/** Content is the new content of the inventory. The length of this slice must be equal to the full size of the inventory window updated. */
		input: ItemStacks | ItemV4s;
		/** WindowID is the ID that identifies one of the windows that the client currently has opened, or one of the consistent windows such as the main inventory. Versions: 1.16.210 – 1.26.60 */
		window_id?: WindowIDVarint | undefined;
		/** Versions: 1.21.20 */
		dynamic_window_id?: number | undefined;
		/** Container is the protocol.FullContainerName that describes the container that the content is for. Versions: 1.21.30 – 1.26.60 */
		container?: FullContainerName | undefined;
		/** Versions: 1.21.30 */
		dynamic_container_size?: number | undefined;
		/** storage_item is the item that is acting as the storage container for the inventory. If the inventory is not a dynamic container then this field should be left empty. When set, only the item type is used by the client and none of the other stack info. Versions: 1.21.42 – 1.26.60 */
		storage_item?: Item | ItemV4 | undefined;
	};
	/**
	 * InventorySlot is sent by the server to update a single slot in one of the inventory windows that the client
	 * currently has opened. Usually this is the main inventory, but it may also be the off hand or, for example,
	 * a chest inventory.
	 */
	export type packet_inventory_slot = {
		/** WindowID is the ID of the window that the packet modifies. It must point to one of the windows that the client currently has opened. */
		window_id: WindowIDVarint;
		/** Slot is the index of the slot that the packet modifies. The new item will be set to the slot at this index. */
		slot: number;
		/** NewItem is the item to be put in the slot at Slot. It will overwrite any item that may currently be present in that slot. */
		item: ItemStack | Item | ItemV4;
		/** Versions: 1.21.20 */
		dynamic_window_id?: number | undefined;
		/** Versions: 1.21.30 – 1.26.60 */
		container?: FullContainerName | undefined;
		/** Versions: 1.21.30 */
		dynamic_container_size?: number | undefined;
		/** Versions: 1.21.42 – 1.26.60 */
		storage_item?: Item | ItemV4 | undefined;
	};
	/**
	 * ContainerSetData is sent by the server to update specific data of a single container, meaning a block such
	 * as a furnace or a brewing stand. This data is usually used by the client to display certain features
	 * client-side.
	 */
	export type packet_container_set_data = {
		/** WindowID is the ID of the window that should have its data set. The player must have a window open with the window ID passed, or nothing will happen. */
		window_id: WindowID;
		/** Key is the key of the property. It is one of the constants that can be found above. Multiple properties share the same key, but the functionality depends on the type of the container that the data is set to. IF FURNACE: 0: furnace_tick_count 1: furnace_lit_time 2: furnace_lit_duration 3: furnace_stored_xp 4: furnace_fuel_aux IF BREWING STAND: 0: brew_time 1: brew_fuel_amount 2: brew_fuel_total */
		property: number;
		/** Value is the value of the property. Its use differs per property. */
		value: number;
	};
	export type packet_crafting_data = {
		/** Versions: 1.16.201 – 1.26.30 */
		recipes?: Recipes | undefined;
		/** PotionContainerChangeRecipes is a list of all recipes to convert a potion from one type to another, such as from a drinkable potion to a splash potion, or from a splash potion to a lingering potion. */
		potion_type_recipes: PotionTypeRecipes;
		potion_container_recipes: PotionContainerChangeRecipes;
		/** Versions: 1.16.201 – 1.17.10 */
		is_clean?: boolean | undefined;
		/** MaterialReducers is a list of all material reducers which is used in education edition chemistry. Versions: 1.17.30 – 1.26.60 */
		material_reducers?: MaterialReducer[] | undefined;
		/** ClearRecipes indicates if all recipes currently active on the client should be cleaned. Doing this means that the client will have no recipes active by itself: Any CraftingData packets previously sent will also be discarded, and only the recipes in this CraftingData packet will be used. Versions: 1.17.30 – 1.26.60 */
		clear_recipes?: boolean | undefined;
		/** As of 1.26.40 recipes are no longer sent as one tagged array; each recipe kind has its own array and the recipe type is implied by which array the recipe appears in. Versions: 1.26.40 – 1.26.60 */
		shaped_recipes?: ShapedRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		shapeless_recipes?: ShapelessRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		multi_recipes?: MultiRecipe[] | undefined;
		/** Shulker box recipes, which are shapeless. Versions: 1.26.40 – 1.26.60 */
		shulker_box_recipes?: ShapelessRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		shapeless_chemistry_recipes?: ShapelessRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		shaped_chemistry_recipes?: ShapedRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		smithing_transform_recipes?: SmithingTransformRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		smithing_trim_recipes?: SmithingTrimRecipe[] | undefined;
	};
	/**
	 * CraftingEvent is sent by the client when it crafts a particular item. Note that this packet may be fully
	 * ignored, as the InventoryTransaction packet provides all the information required.
	 */
	export type packet_crafting_event = {
		/** WindowID is the ID representing the window that the player crafted in. */
		window_id: WindowID;
		/** CraftingType is a type that indicates the way the crafting was done, for example if a crafting table was used. */
		recipe_type: "inventory" | "crafting" | "workbench" | number;
		/** RecipeUUID is the UUID of the recipe that was crafted. It points to the UUID of the recipe that was sent earlier in the CraftingData packet. */
		recipe_id: string;
		/** Input is a list of items that the player put into the recipe so that it could create the Output items. These items are consumed in the process. */
		input: Item[] | ItemV4[];
		/** Output is a list of items that were obtained as a result of crafting the recipe. */
		result: Item[] | ItemV4[];
	};
	/**
	 * GUIDataPickItem is sent by the server to make the client 'select' a hot bar slot. It currently appears to
	 * be broken however, and does not actually set the selected slot to the hot bar slot set in the packet.
	 */
	export type packet_gui_data_pick_item = {
		/** ItemName is the name of the item that shows up in the top part of the popup that shows up when selecting an item. It is shown as if an item was selected by the player itself. Versions: 1.16.210 – 1.26.60 */
		item_name?: string | undefined;
		/** ItemEffects is the line under the ItemName, where the effects of the item are usually situated. Versions: 1.16.210 – 1.26.60 */
		item_effects?: string | undefined;
		/** HotBarSlot is the hot bar slot to be selected/picked. This does not currently work, so it does not matter what number this is. Versions: 1.16.210 – 1.26.60 */
		hotbar_slot?: number | undefined;
	};
	/**
	 * AdventureSettings is sent by the server to update game-play related features, in particular permissions to
	 * access these features for the client. It includes allowing the player to fly, build and mine, and attack
	 * entities. Most of these flags should be checked server-side instead of using this packet only.
	 * The client may also send this packet to the server when it updates one of these settings through the
	 * in-game settings interface. The server should verify if the player actually has permission to update those
	 * settings.
	 */
	export type packet_adventure_settings = {
		/** Flags is a set of flags that specify certain properties of the player, such as whether or not it can fly and/or move through blocks. It is one of the AdventureFlag constants above. */
		flags: AdventureFlags;
		/** CommandPermissionLevel is a permission level that specifies the kind of commands that the player is allowed to use. */
		command_permission: "normal" | "operator" | "host" | "automation" | "admin" | number | CommandPermissionLevelVarint;
		/** ActionPermissions is, much like Flags, a set of flags that specify actions that the player is allowed to undertake, such as whether it is allowed to edit blocks, open doors etc. It is a combination of the ActionPermission constants above. */
		action_permissions: ActionPermissions;
		/** PermissionLevel is the permission level of the player as it shows up in the player list built up using the PlayerList packet. It is one of the PermissionLevel constants above. */
		permission_level: "visitor" | "member" | "operator" | "custom" | number | PermissionLevel;
		/** Custom permissions */
		custom_stored_permissions: number;
		/** PlayerUniqueID is a unique identifier of the player. It appears it is not required to fill this field out with a correct value. Simply writing 0 seems to work. */
		user_id: Int64;
	};
	export type AdventureFlags = {
		_value: number;
		world_immutable: boolean;
		no_pvp: boolean;
		auto_jump: boolean;
		allow_flight: boolean;
		no_clip: boolean;
		world_builder: boolean;
		flying: boolean;
		muted: boolean;
	};
	export type ActionPermissions = {
		_value: number;
		/** Versions: 1.16.201 */
		build_and_mine?: boolean | undefined;
		doors_and_switches: boolean;
		open_containers: boolean;
		attack_players: boolean;
		attack_mobs: boolean;
		operator: boolean;
		teleport: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		mine?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		build?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		default?: boolean | undefined;
	};
	export type packet_block_entity_data = {
		position: BlockCoordinates;
		nbt: NBT;
	};
	/**
	 * Removed in 1.21.80
	 */
	export type packet_player_input = {
		motion_x: number;
		motion_z: number;
		jumping: boolean;
		sneaking: boolean;
	};
	/**
	 * LevelChunk is sent by the server to provide the client with a chunk of a world data (16xYx16 blocks).
	 * Typically a certain amount of chunks is sent to the client before sending it the spawn PlayStatus packet,
	 * so that the client spawns in a loaded world.
	 */
	export type packet_level_chunk = {
		/** ChunkX is the X coordinate of the chunk sent. (To translate a block's X to a chunk's X: x >> 4) */
		x: number;
		/** ChunkZ is the Z coordinate of the chunk sent. (To translate a block's Z to a chunk's Z: z >> 4) */
		z: number;
		/** SubChunkCount is the amount of sub chunks that are part of the chunk sent. Depending on if the cache is enabled, a list of blob hashes will be sent, or, if disabled, the sub chunk data. On newer versions, if this is a negative value it indicates to use the Subchunk Polling mechanism */
		sub_chunk_count: number;
		/** CacheEnabled specifies if the client blob cache should be enabled. This system is based on hashes of blobs which are consistent and saved by the client in combination with that blob, so that the server does not have to send the same chunk multiple times. If the client does not yet have a blob with the hash sent, it will send a ClientCacheBlobStatus packet containing the hashes is does not have the data of. */
		cache_enabled: boolean;
		/** BlobHashes is a list of all blob hashes used in the chunk. It is composed of SubChunkCount + 1 hashes, with the first SubChunkCount hashes being those of the sub chunks and the last one that of the biome of the chunk. If CacheEnabled is set to false, BlobHashes is left empty. As of 1.26.40 the array is always written. */
		blobs?: {
			hashes: Int64[];
		} | Int64[] | undefined;
		/** RawPayload is a serialised string of chunk data. The data held depends on if CacheEnabled is set to true. If set to false, the payload is composed of multiple sub-chunks, each of which carry a version which indicates the way they are serialised, followed by biomes, border blocks and tile entities. If CacheEnabled is true, the payload consists out of the border blocks and tile entities only. */
		payload: ByteArray;
		/** Versions: 1.18.11 – 1.26.60 */
		highest_subchunk_count?: number | undefined;
		/** Versions: 1.20.61 – 1.26.60 */
		dimension?: number | undefined;
		/** Versions: 1.26.60 */
		client_biome_update?: boolean | undefined;
	};
	export type packet_set_commands_enabled = {
		enabled: boolean;
	};
	export type packet_set_difficulty = {
		difficulty: number;
	};
	export type packet_change_dimension = {
		dimension: number;
		position: vec3f;
		respawn: boolean;
		/** Versions: 1.21.20 – 1.26.60 */
		loading_screen_id?: number | undefined;
	};
	/**
	 * SetPlayerGameType is sent by the server to update the game type (game mode) of the player
	 */
	export type packet_set_player_game_type = {
		/** The new gamemode for the player. Some of these game types require additional flags to be set in an AdventureSettings packet for the game mode to obtain its full functionality. # Note: this is actually encoded 64-bit varint, but realistically won't exceed a few bits */
		gamemode: GameMode;
	};
	export type packet_player_list = {
		records: PlayerRecords;
	};
	export type packet_simple_event = {
		event_type: "uninitialized_subtype" | "enable_commands" | "disable_commands" | "unlock_world_template_settings" | number;
	};
	/**
	 * Event is sent by the server to send an event with additional data. It is typically sent to the client for
	 * telemetry reasons, much like the SimpleEvent packet.
	 */
	export type packet_event = {
		runtime_id: bigint;
		event_type: "achievement_awarded" | "entity_interact" | "portal_built" | "portal_used" | "mob_killed" | "cauldron_used" | "player_death" | "boss_killed" | "agent_command" | "agent_created" | "banner_pattern_removed" | "command_executed" | "fish_bucketed" | "mob_born" | "pet_died" | "cauldron_block_used" | "composter_block_used" | "bell_block_used" | number | "actor_definition" | "raid_update" | "player_movement_anomaly" | "player_movement_corrected" | "honey_harvested" | "target_block_hit" | "piglin_barter" | "waxed_or_unwaxed_copper" | "code_builder_runtime_action" | "code_builder_scoreboard" | "strider_ridden_in_lava_in_overworld" | "sneak_close_to_sculk_sensor" | "careful_restoration" | "item_used";
		use_player_id: number;
		event_data: Buffer;
	};
	export type packet_spawn_experience_orb = {
		position: vec3f;
		count: number;
	};
	/**
	 * ClientBoundMapItemData is sent by the server to the client to update the data of a map shown to the client.
	 * It is sent with a combination of flags that specify what data is updated.
	 * The ClientBoundMapItemData packet may be used to update specific parts of the map only. It is not required
	 * to send the entire map each time when updating one part.
	 */
	export type packet_clientbound_map_item_data = {
		/** Versions: 1.16.201 – 1.16.210 */
		mapinfo?: never | undefined;
		/** MapID is the unique identifier that represents the map that is updated over network. It remains consistent across sessions. Versions: 1.16.220 – 1.26.60 */
		map_id?: bigint | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		update_flags?: UpdateMapFlags | undefined;
		/** Dimension is the dimension of the map that should be updated, for example the overworld (0), the nether (1) or the end (2). Versions: 1.16.220 – 1.26.60 */
		dimension?: number | undefined;
		/** LockedMap specifies if the map that was updated was a locked map, which may be done using a cartography table. Versions: 1.16.220 – 1.26.60 */
		locked?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		included_in?: bigint[] | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		scale?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		tracked?: {
			objects: TrackedObject[];
			decorations: MapDecoration[];
		} | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		texture?: {
			width: number;
			height: number;
			x_offset: number;
			y_offset: number;
			pixels: number[];
		} | undefined;
		/** Origin is the center position of the map being updated. Versions: 1.19.20 – 1.26.60 */
		origin?: vec3i | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		tracked_objects?: TrackedObject[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		decorations?: MapDecoration[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		width?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		height?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		x_offset?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		y_offset?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		pixels?: number[] | undefined;
	};
	export type packet_map_info_request = {
		map_id: bigint;
		/** ClientPixels is a map of pixels sent from the client to notify the server about the pixels that it isn't aware of. Versions: 1.19.20 – 1.26.60 */
		client_pixels?: {
			rgba: number;
			index: number;
		}[] | undefined;
	};
	/**
	 * RequestChunkRadius is sent by the client to the server to update the server on the chunk view radius that
	 * it has set in the settings. The server may respond with a ChunkRadiusUpdated packet with either the chunk
	 * radius requested, or a different chunk radius if the server chooses so.
	 */
	export type packet_request_chunk_radius = {
		/** ChunkRadius is the requested chunk radius. This value is always the value set in the settings of the player. */
		chunk_radius: number;
		/** Versions: 1.19.80 – 1.26.60 */
		max_radius?: number | undefined;
	};
	/**
	 * ChunkRadiusUpdated is sent by the server in response to a RequestChunkRadius packet. It defines the chunk
	 * radius that the server allows the client to have. This may be lower than the chunk radius requested by the
	 * client in the RequestChunkRadius packet.
	 */
	export type packet_chunk_radius_update = {
		/** ChunkRadius is the final chunk radius that the client will adapt when it receives the packet. It does not have to be the same as the requested chunk radius. */
		chunk_radius: number;
	};
	/**
	 * Versions: 1.16.201 – 1.20.61
	 */
	export type packet_item_frame_drop_item = {
		/** Versions: 1.16.201 – 1.20.61 */
		coordinates: BlockCoordinates;
	};
	export type packet_game_rules_changed = {
		rules: GameRules | GameRuleI32[];
	};
	/**
	 * Camera is sent by the server to use an Education Edition camera on a player. It produces an image
	 * client-side.
	 */
	export type packet_camera = {
		/** CameraEntityUniqueID is the unique ID of the camera entity from which the picture was taken. */
		camera_entity_unique_id: bigint;
		/** TargetPlayerUniqueID is the unique ID of the target player. The unique ID is a value that remains consistent across different sessions of the same world, but most servers simply fill the runtime ID of the player out for this field. */
		target_player_unique_id: bigint;
	};
	export type packet_boss_event = {
		/** Versions: 1.16.201 – 1.26.20 */
		boss_entity_id?: bigint | undefined;
		type: "show_bar" | "register_player" | "hide_bar" | "unregister_player" | "set_bar_progress" | "set_bar_title" | "update_properties" | "texture" | number | "query";
		/** Versions: 1.16.201 – 1.26.45 */
		player_id?: bigint | undefined;
		/** BossBarTitle is the title shown above the boss bar. It currently does not function, and instead uses the name tag of the boss entity at all times. It is only set if the EventType is BossEventShow or BossEventTitle. */
		title?: string | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		bar_progress?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		darkness_factor?: number | undefined;
		/** Colour is the colour of the boss bar that is shown when a player is subscribed. It currently does not function. It is only set if the EventType is BossEventShow, BossEventAppearanceProperties or BossEventTexture. Format is ARGB */
		color?: number | "pink" | "blue" | "red" | "green" | "yellow" | "purple" | "rebecca_purple" | "white" | undefined;
		/** Overlay is the overlay of the boss bar that is shown on top of the boss bar when a player is subscribed. It currently does not function. It is only set if the EventType is BossEventShow, BossEventAppearanceProperties or BossEventTexture. */
		overlay?: number | "progress" | "notched_6" | "notched_10" | "notched_12" | "notched_20" | undefined;
		/** HealthPercentage is the percentage of health that is shown in the boss bar. It currently does not function, and instead uses the health percentage of the boss entity at all times. It is only set if the EventType is BossEventShow or BossEventHealthPercentage. Versions: 1.16.220 – 1.26.60 */
		progress?: number | undefined;
		/** Versions: 1.16.220 – 1.26.20 */
		screen_darkening?: number | undefined;
		/** FilteredBossBarTitle is a filtered version of BossBarTitle with all the profanity removed. The client will use this over BossBarTitle if this field is not empty and they have the "Filter Profanity" setting enabled. Versions: 1.21.60 – 1.26.60 */
		filtered_title?: string | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		target_entity_id?: bigint | undefined;
	};
	export type packet_show_credits = {
		runtime_entity_id: number | bigint;
		status: number;
	};
	/**
	 * This packet sends a list of commands to the client. Commands can have
	 * arguments, and some of those arguments can have 'enum' values, which are a list of possible
	 * values for the argument. The serialization is rather complex and involves palettes like chunks.
	 * # In bedrock-protocol, listen to on('client.commands') for a simpler representation
	 */
	export type packet_available_commands = {
		/** The length of the enums for all the command parameters in this packet */
		values_len: number;
		/** Versions: 1.16.201 – 1.21.124 */
		_enum_type?: "byte" | "short" | "int" | undefined;
		/** Here all the enum values for all of the possible commands are stored to one array palette */
		enum_values: string[];
		/** Integer parameters may sometimes have a prefix, such as the XP command: /xp <amount: int> [player: target] <- here, the xp command gives experience points /xp <amount: int>L [player: target] <- here, the xp command gives experience levels This is the palette of suffixes */
		suffixes: string[];
		/** The list of enum objects */
		enums: {
			/** The name of the enum */
			name: string;
			/** The values in the enum. In 1.21.130 this is always lu32. */
			values: Array<number | undefined> | number[];
		}[];
		command_data: {
			name: string;
			description: string;
			flags: number;
			permission_level: number | string;
			alias: number;
			overloads: {
				parameters: {
					parameter_name: string;
					value_type: "int" | "float" | "value" | "wildcard_int" | "operator" | "target" | "file_path" | "string" | "position" | "message" | "raw_text" | "json" | "command" | number | "wildcard" | "block_position" | "command_operator" | "wildcard_target" | "integer_range" | "equipment_slots" | "block_states";
					enum_type: "valid" | "enum" | "suffixed" | "soft_enum" | number;
					optional: boolean;
					options: CommandFlags;
				}[];
				chaining?: boolean | undefined;
			}[];
			chained_subcommand_offsets?: number[] | undefined;
		}[];
		dynamic_enums: {
			name: string;
			values: string[];
		}[];
		enum_constraints: {
			value_index: number;
			enum_index: number;
			constraints: {
				constraint: "cheats_enabled" | number | "operator_permissions" | "host_permissions";
			}[];
		}[];
		/** chained_subcommand_values is a slice of all chained subcommand names. chained_subcommand_values generally should contain each possible value only once. chained_subcommands are built by pointing to entries in this slice. Versions: 1.20.10 – 1.26.60 */
		chained_subcommand_values?: string[] | undefined;
		/** chained_subcommands is a slice of all subcommands that are followed by a chained command. An example usage of this is /execute which allows you to run another command as another entity or at a different position etc. Versions: 1.20.10 – 1.26.60 */
		chained_subcommands?: {
			/** ChainedSubcommandValue represents the value for a chained subcommand argument. name is the name of the chained subcommand and shows up in the list as a regular subcommand enum. */
			name: string;
			/** values contains the index and parameter type of the chained subcommand. */
			values: {
				/** index is the index of the argument in the ChainedSubcommandValues slice. In 1.21.130 this changed from lu16 to varint. */
				index: number;
				/** value is a combination of the flags above. In 1.21.130 this changed from lu16 to varint. */
				value: number;
			}[];
		}[] | undefined;
	};
	/**
	 * ParamOptionCollapseEnum specifies if the enum (only if the Type is actually an enum type. If not,
	 * setting this to true has no effect) should be collapsed. This means that the options of the enum are
	 * never shown in the actual usage of the command, but only as auto-completion, like it automatically does
	 * with enums that have a big amount of options. To illustrate, it can make
	 * <false|true|yes|no> <$Name: bool>.
	 */
	export type CommandFlags = {
		unused: number;
		has_semantic_constraint: number;
		collapse_enum: number;
		/** Versions: 1.17.30 – 1.26.60 */
		as_chained_command?: number | undefined;
		/** Versions: 1.18.0 – 1.26.60 */
		unknown2?: number | undefined;
	};
	/**
	 * enum_size_based_on_values_len: native
	 * CommandRequest is sent by the client to request the execution of a server-side command. Although some
	 * servers support sending commands using the Text packet, this packet is guaranteed to have the correct
	 * result.
	 */
	export type packet_command_request = {
		/** CommandLine is the raw entered command line. The client does no parsing of the command line by itself (unlike it did in the early stages), but lets the server do that. */
		command: string;
		/** Origin holds information about the command sender that will be returnd back in the command response */
		origin: CommandOrigin;
		/** Internal specifies if the command request internal. Setting it to false seems to work and the usage of this field is not known. */
		internal: boolean;
		/** Specifies the version of the command to run, relative to the current Minecraft version. Should be set to 52 as of 1.19.62 Versions: 1.19.60 – 1.26.60 */
		version?: number | string | undefined;
	};
	/**
	 * CommandBlockUpdate is sent by the client to update a command block at a specific position. The command
	 * block may be either a physical block or an entity.
	 */
	export type packet_command_block_update = {
		/** Block specifies if the command block updated was an actual physical block. If false, the command block is in a minecart and has an entity runtime ID instead. */
		is_block: boolean;
		position?: BlockCoordinates | undefined;
		mode?: "impulse" | "repeat" | "chain" | number | undefined;
		needs_redstone?: boolean | undefined;
		conditional?: boolean | undefined;
		minecart_entity_runtime_id?: bigint | undefined;
		command: string;
		last_output: string;
		name: string;
		should_track_output: boolean;
		tick_delay: number;
		execute_on_first_tick: boolean;
		/** Versions: 1.21.60 – 1.26.60 */
		filtered_name?: string | undefined;
	};
	export type packet_command_output = {
		/** CommandOrigin is the data specifying the origin of the command. In other words, the source that the command request was from, such as the player itself or a websocket server. The client forwards the messages in this packet to the right origin, depending on what is sent here. */
		origin: CommandOrigin;
		/** OutputType specifies the type of output that is sent. OutputType specifies the type of output that is sent. */
		output_type: number | "last" | "silent" | "all" | "data_set" | string;
		/** SuccessCount is the amount of times that a command was executed successfully as a result of the command that was requested. For servers, this is usually a rather meaningless fields, but for vanilla, this is applicable for commands created with Functions. */
		success_count: number;
		/** OutputMessages is a list of all output messages that should be sent to the player. Whether they are shown or not, depends on the type of the messages. */
		output: {
			/** Success indicates if the output message was one of a successful command execution. */
			success: boolean;
			/** Message is the message that is sent to the client in the chat window. */
			message_id: string;
			/** Parameters is a list of parameters that serve to supply the message sent with additional information, such as the position that a player was teleported to or the effect that was applied to an entity. These parameters only apply for the Minecraft built-in command output. */
			parameters: string[];
		}[];
		/** Versions: 1.16.210 – 1.21.124 */
		data_set?: string | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		has_data?: boolean | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		data?: string | undefined;
	};
	/**
	 * UpdateTrade is sent by the server to update the trades offered by a villager to a player. It is sent at the
	 * moment that a player interacts with a villager.
	 */
	export type packet_update_trade = {
		/** WindowID is the ID that identifies the trading window that the client currently has opened. */
		window_id: WindowID;
		/** WindowType is an identifier specifying the type of the window opened. In vanilla, it appears this is always filled out with 15. */
		window_type: WindowType;
		/** Size is the amount of trading options that the villager has. */
		size: number;
		/** TradeTier is the tier of the villager that the player is trading with. The tier starts at 0 with a first two offers being available, after which two additional offers are unlocked each time the tier becomes one higher. */
		trade_tier: number;
		/** VillagerUniqueID is the unique ID of the villager entity that the player is trading with. The TradeTier sent above applies to this villager. */
		villager_unique_id: bigint;
		/** EntityUniqueID is the unique ID of the entity (usually a player) for which the trades are updated. The updated trades may apply only to this entity. */
		entity_unique_id: bigint;
		/** DisplayName is the name displayed at the top of the trading UI. It is usually used to represent the profession of the villager in the UI. */
		display_name: string;
		/** NewTradeUI specifies if the villager should be using the new trade UI (The one added in 1.11.) rather than the old one. This should usually be set to true. */
		new_trading_ui: boolean;
		/** Trading based on Minecraft economy - specifies if the prices of the villager's offers are modified by an increase in demand for the item. (A mechanic added in 1.11.) Buying more of the same item will increase the price of that particular item. https://minecraft.wiki/w/Trading#Economics */
		economic_trades: boolean;
		/** NBT serialised compound of offers that the villager has. */
		offers: NBT;
	};
	/**
	 * UpdateEquip is sent by the server to the client upon opening a horse inventory. It is used to set the
	 * content of the inventory and specify additional properties, such as the items that are allowed to be put
	 * in slots of the inventory.
	 */
	export type packet_update_equipment = {
		/** WindowID is the identifier associated with the window that the UpdateEquip packet concerns. It is the ID sent for the horse inventory that was opened before this packet was sent. */
		window_id: WindowID;
		/** WindowType is the type of the window that was opened. Generally, this is the type of a horse inventory, as the packet is specifically made for that. */
		window_type: WindowType;
		/** Size is the size of the horse inventory that should be opened. A bigger size does, in fact, change the amount of slots displayed. */
		size: number;
		/** EntityUniqueID is the unique ID of the entity whose equipment was 'updated' to the player. It is typically the horse entity that had its inventory opened. */
		entity_id: bigint;
		/** `inventory` is a network NBT serialised compound holding the content of the inventory of the entity (the equipment) and additional data such as the allowed items for a particular slot, used to make sure only saddles can be put in the saddle slot etc. */
		inventory: NBT;
	};
	/**
	 * ResourcePackDataInfo is sent by the server to the client to inform the client about the data contained in
	 * one of the resource packs that are about to be sent.
	 */
	export type packet_resource_pack_data_info = {
		/** Versions: 1.16.201 – 1.16.210 */
		package_id?: string | undefined;
		/** DataChunkSize is the maximum size in bytes of the chunks in which the total size of the resource pack to be sent will be divided. A size of 1MB (1024*1024) means that a resource pack of 15.5MB will be split into 16 data chunks. */
		max_chunk_size: number;
		/** ChunkCount is the total amount of data chunks that the sent resource pack will exist out of. It is the total size of the resource pack divided by the DataChunkSize field. The client doesn't actually seem to use this field. Rather, it divides the size by the chunk size to calculate it itself. */
		chunk_count: number;
		/** Versions: 1.16.201 – 1.16.210 */
		compressed_package_size?: Int64 | undefined;
		/** Hash is a SHA256 hash of the content of the resource pack. */
		hash: ByteArray;
		/** Premium specifies if the resource pack was a premium resource pack, meaning it was bought from the Minecraft store. */
		is_premium: boolean;
		/** PackType is the type of the resource pack. It is one of the resource pack types listed. */
		pack_type: number | "addon" | "cached" | "copy_protected" | "behavior" | "persona_piece" | "resources" | "skins" | "world_template";
		/** UUID is the unique ID of the resource pack that the info concerns. Versions: 1.16.220 – 1.26.60 */
		pack_id?: string | undefined;
		/** Size is the total size in bytes that the resource pack occupies. This is the size of the compressed archive (zip) of the resource pack. Versions: 1.16.220 – 1.26.60 */
		size?: Int64 | undefined;
	};
	/**
	 * ResourcePackChunkData is sent to the client so that the client can download the resource pack. Each packet
	 * holds a chunk of the compressed resource pack, of which the size is defined in the ResourcePackDataInfo
	 * packet sent before.
	 */
	export type packet_resource_pack_chunk_data = {
		/** Versions: 1.16.201 – 1.16.210 */
		package_id?: string | undefined;
		/** ChunkIndex is the current chunk index of the chunk. It is a number that starts at 0 and is incremented for each resource pack data chunk sent to the client. */
		chunk_index: number;
		/** DataOffset is the current progress in bytes or offset in the data that the resource pack data chunk is taken from. */
		progress: Int64;
		/** RawPayload is a byte slice containing a chunk of data from the resource pack. It must be of the same size or less than the DataChunkSize set in the ResourcePackDataInfo packet. */
		payload: ByteArray;
		/** UUID is the unique ID of the resource pack that the chunk of data is taken out of. Versions: 1.16.220 – 1.26.60 */
		pack_id?: string | undefined;
	};
	/**
	 * ResourcePackChunkRequest is sent by the client to request a chunk of data from a particular resource pack,
	 * that it has obtained information about in a ResourcePackDataInfo packet.
	 */
	export type packet_resource_pack_chunk_request = {
		/** Versions: 1.16.201 – 1.16.210 */
		package_id?: string | undefined;
		/** ChunkIndex is the requested chunk index of the chunk. It is a number that starts at 0 and is incremented for each resource pack data chunk requested. */
		chunk_index: number;
		/** UUID is the unique ID of the resource pack that the chunk of data is requested from. Versions: 1.16.220 – 1.26.60 */
		pack_id?: string | undefined;
	};
	export type packet_transfer = {
		server_address: string;
		port: number;
		/** Versions: 1.21.30 – 1.26.60 */
		reload_world?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		gatherings_configuration?: GatheringJoinInfo | undefined;
	};
	export type packet_play_sound = {
		name: string;
		coordinates: BlockCoordinates;
		volume: number;
		pitch: number;
		/** Versions: 1.26.20 – 1.26.60 */
		handle?: Int64 | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		loop_count?: number | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		bypass_listener_range_check?: boolean | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		playback_position_seconds?: number | undefined;
	};
	export type packet_stop_sound = {
		name: string;
		stop_all: boolean;
		/** Versions: 1.21.20 – 1.26.60 */
		stop_music_legacy?: boolean | undefined;
	};
	/**
	 * SetTitle is sent by the server to make a title, subtitle or action bar shown to a player. It has several
	 * fields that allow setting the duration of the titles.
	 */
	export type packet_set_title = {
		/** ActionType is the type of the action that should be executed upon the title of a player. It is one of the constants above and specifies the response of the client to the packet. */
		type: number | "clear" | "reset" | "set_title" | "set_subtitle" | "action_bar_message" | "set_durations" | "set_title_json" | "set_subtitle_json" | "action_bar_message_json";
		/** Text is the text of the title, which has a different meaning depending on the ActionType that the packet has. The text is the text of a title, subtitle or action bar, depending on the type set. */
		text: string;
		/** FadeInDuration is the duration that the title takes to fade in on the screen of the player. It is measured in 20ths of a second (AKA in ticks). */
		fade_in_time: number;
		/** RemainDuration is the duration that the title remains on the screen of the player. It is measured in 20ths of a second (AKA in ticks). */
		stay_time: number;
		/** FadeOutDuration is the duration that the title takes to fade out of the screen of the player. It is measured in 20ths of a second (AKA in ticks). */
		fade_out_time: number;
		/** XUID is the XBOX Live user ID of the player, which will remain consistent as long as the player is logged in with the XBOX Live account. It is empty if the user is not logged into its XBL account. Versions: 1.17.10 – 1.26.60 */
		xuid?: string | undefined;
		/** PlatformOnlineID is either a uint64 or an empty string. Versions: 1.17.10 – 1.26.60 */
		platform_online_id?: string | undefined;
		/** FilteredMessage is a filtered version of Message with all the profanity removed. The client will use this over Message if this field is not empty and they have the "Filter Profanity" setting enabled. Versions: 1.21.20 – 1.26.60 */
		filtered_message?: string | undefined;
	};
	export type packet_add_behavior_tree = {
		behaviortree: string;
	};
	/**
	 * StructureBlockUpdate is sent by the client when it updates a structure block using the in-game UI. The
	 * data it contains depends on the type of structure block that it is. In Minecraft Bedrock Edition v1.11,
	 * there is only the Export structure block type, but in v1.13 the ones present in Java Edition will,
	 * according to the wiki, be added too.
	 */
	export type packet_structure_block_update = {
		/** Position is the position of the structure block that is updated. Versions: 1.16.220 – 1.26.60 */
		position?: BlockCoordinates | undefined;
		/** StructureName is the name of the structure that was set in the structure block's UI. This is the name used to export the structure to a file. Versions: 1.16.220 – 1.26.60 */
		structure_name?: string | undefined;
		/** DataField is the name of a function to run, usually used during natural generation. A description can be found here: https://minecraft.wiki/w/Structure_Block#Data. Versions: 1.16.220 – 1.26.60 */
		data_field?: string | undefined;
		/** IncludePlayers specifies if the 'Include Players' toggle has been enabled, meaning players are also exported by the structure block. Versions: 1.16.220 – 1.26.60 */
		include_players?: boolean | undefined;
		/** ShowBoundingBox specifies if the structure block should have its bounds outlined. A thin line will encapsulate the bounds of the structure if set to true. Versions: 1.16.220 – 1.26.60 */
		show_bounding_box?: boolean | undefined;
		/** StructureBlockType is the type of the structure block updated. A list of structure block types that will be used can be found in the constants above. Versions: 1.16.220 – 1.26.60 */
		structure_block_type?: number | undefined;
		/** Settings is a struct of settings that should be used for exporting the structure. These settings are identical to the last sent in the StructureBlockUpdate packet by the client. Versions: 1.16.220 – 1.26.60 */
		settings?: StructureBlockSettings | undefined;
		/** RedstoneSaveMode is the mode that should be used to save the structure when used with redstone. In Java Edition, this is always stored in memory, but in Bedrock Edition it can be stored either to disk or memory. See the constants above for the options. As of 1.26.40 this is a single byte instead of a zigzag varint. Versions: 1.16.220 – 1.26.60 */
		redstone_save_mode?: number | undefined;
		/** ShouldTrigger specifies if the structure block should be triggered immediately after this packet reaches the server. Versions: 1.16.220 – 1.26.60 */
		should_trigger?: boolean | undefined;
		/** Waterlogged specifies if the structure block is waterlogged at the time of the packet being sent. Versions: 1.19.30 – 1.26.60 */
		water_logged?: boolean | undefined;
		/** FilteredStructureName is a filtered version of StructureName with all the profanity removed. The client will use this over StructureName if this field is not empty and they have the "Filter Profanity" setting enabled. Versions: 1.21.60 – 1.26.60 */
		filtered_structure_name?: string | undefined;
	};
	/**
	 * ShowStoreOffer is sent by the server to show a Marketplace store offer to a player. It opens a window
	 * client-side that displays the item.
	 * The ShowStoreOffer packet only works on the partnered servers: Servers that are not partnered will not have
	 * a store buttons show up in the in-game pause menu and will, as a result, not be able to open store offers
	 * on the client side. Sending the packet does therefore not work when using a proxy that is not connected to
	 * with the domain of one of the partnered servers.
	 */
	export type packet_show_store_offer = {
		/** Versions: 1.16.201 – 1.16.210 */
		unknown0?: string | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown1?: boolean | undefined;
		/** Versions: 1.16.220 – 1.21.111 */
		offer_id?: string | undefined;
		/** Versions: 1.16.220 – 1.20.40 */
		show_all?: boolean | undefined;
		/** ShowAll specifies if all other offers of the same 'author' as the one of the offer associated with the OfferUUID should also be displayed, alongside the target offer. Versions: 1.20.50 – 1.26.60 */
		redirect_type?: "marketplace" | "dressing_room" | "third_party_server_page" | number | undefined;
		/** OfferUUID is a UUID that identifies the offer for which a window should be opened. Versions: 1.21.120 – 1.26.60 */
		offer_uuid?: string | undefined;
	};
	/**
	 * PurchaseReceipt is sent by the client to the server to notify the server it purchased an item from the
	 * Marketplace store that was offered by the server. The packet is only used for partnered servers.
	 */
	export type packet_purchase_receipt = {
		/** Receipts is a list of receipts, or proofs of purchases, for the offers that have been purchased by the player. */
		receipts: string[];
	};
	export type packet_player_skin = {
		uuid: string;
		skin: Skin;
		skin_name: string;
		old_skin_name: string;
		/** Versions: 1.16.201 – 1.26.30 */
		is_verified?: boolean | undefined;
	};
	/**
	 * SubClientLogin is sent when a sub-client joins the server while another client is already connected to it.
	 * The packet is sent as a result of split-screen game play, and allows up to four players to play using the
	 * same network connection. After an initial Login packet from the 'main' client, each sub-client that
	 * connects sends a SubClientLogin to request their own login.
	 */
	export type packet_sub_client_login = {
		/** ConnectionRequest is a string containing information about the player and JWTs that may be used to verify if the player is connected to XBOX Live. The connection request also contains the necessary client public key to initiate encryption. The ConnectionRequest in this packet is identical to the one found in the Login packet. */
		tokens?: LoginTokens | undefined;
	};
	/**
	 * AutomationClientConnect is used to make the client connect to a websocket server. This websocket server has
	 * the ability to execute commands on the behalf of the client and it can listen for certain events fired by
	 * the client.
	 */
	export type packet_initiate_web_socket_connection = {
		/** ServerURI is the URI to make the client connect to. It can be, for example, 'localhost:8000/ws' to connect to a websocket server on the localhost at port 8000. */
		server: string;
	};
	/**
	 * SetLastHurtBy is sent by the server to let the client know what entity type it was last hurt by. At this
	 * moment, the packet is useless and should not be used. There is no behaviour that depends on if this
	 * packet is sent or not.
	 */
	export type packet_set_last_hurt_by = {
		/** Versions: 1.16.201 – 1.16.210 */
		unknown?: number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		entity_type?: number | undefined;
	};
	/**
	 * BookEdit is sent by the client when it edits a book. It is sent each time a modification was made and the
	 * player stops its typing 'session', rather than simply after closing the book.
	 */
	export type packet_book_edit = {
		type: "replace_page" | "add_page" | "delete_page" | "swap_pages" | "sign" | number;
		/** Versions: 1.16.201 – 1.21.130 */
		slot?: number | undefined;
		page_number?: number | undefined;
		text?: string | undefined;
		photo_name?: string | undefined;
		page1?: number | undefined;
		page2?: number | undefined;
		title?: string | undefined;
		author?: string | undefined;
		xuid?: string | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		inventory_slot?: number | undefined;
	};
	/**
	 * NPCRequest is sent by the client when it interacts with an NPC.
	 * The packet is specifically made for Education Edition, where NPCs are available to use.
	 */
	export type packet_npc_request = {
		/** EntityRuntimeID is the runtime ID of the NPC entity that the player interacted with. It is the same as sent by the server when spawning the entity. */
		runtime_entity_id: number | bigint;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown0?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown1?: string | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown2?: number | undefined;
		/** RequestType is the type of the request, which depends on the permission that the player has. It will be either a type that indicates that the NPC should show its dialog, or that it should open the editing window. Versions: 1.16.220 – 1.26.60 */
		request_type?: "set_actions" | "execute_action" | "execute_closing_commands" | "set_name" | "set_skin" | "set_interaction_text" | "execute_opening_commands" | number | undefined;
		/** CommandString is the command string set in the NPC. It may consist of multiple commands, depending on what the player set in it. Versions: 1.16.220 – 1.26.60 */
		command?: string | undefined;
		/** ActionType is the type of the action to execute. Versions: 1.16.220 – 1.26.60 */
		action_type?: number | "set_actions" | "execute_action" | "execute_closing_commands" | "set_name" | "set_skin" | "set_interact_text" | "execute_opening_commands" | undefined;
		/** SceneName is the name of the scene. Versions: 1.17.10 – 1.26.60 */
		scene_name?: string | undefined;
	};
	/**
	 * PhotoTransfer is sent by the server to transfer a photo (image) file to the client. It is typically used
	 * to transfer photos so that the client can display it in a portfolio in Education Edition.
	 * While previously usable in the default Bedrock Edition, the displaying of photos in books was disabled and
	 * the packet now has little use anymore.
	 */
	export type packet_photo_transfer = {
		/** Versions: 1.16.201 – 1.16.210 */
		file_name?: string | undefined;
		/** PhotoData is the raw data of the photo image. The format of this data may vary: Formats such as JPEG or PNG work, as long as PhotoName has the correct extension. */
		image_data: string;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown2?: string | undefined;
		/** PhotoName is the name of the photo to transfer. It is the exact file name that the client will download the photo as, including the extension of the file. Versions: 1.16.220 – 1.26.60 */
		image_name?: string | undefined;
		/** BookID is the ID of the book that the photo is associated with. If the PhotoName in a book with this ID is set to PhotoName, it will display the photo (provided Education Edition is used). The photo image is downloaded to a sub-folder with this book ID. Versions: 1.16.220 – 1.26.60 */
		book_id?: string | undefined;
		/** PhotoType is one of the three photo types above. Versions: 1.17.30 – 1.26.60 */
		photo_type?: number | undefined;
		/** SourceType is the source photo type. It is one of the three photo types above. Versions: 1.17.30 – 1.26.60 */
		source_type?: number | undefined;
		/** OwnerEntityUniqueID is the entity unique ID of the photo's owner. Versions: 1.17.30 – 1.26.60 */
		owner_entity_unique_id?: Int64 | undefined;
		/** NewPhotoName is the new name of the photo. Versions: 1.17.30 – 1.26.60 */
		new_photo_name?: string | undefined;
	};
	/**
	 * ModalFormRequest is sent by the server to make the client open a form. This form may be either a modal form
	 * which has two options, a menu form for a selection of options and a custom form for properties.
	 */
	export type packet_modal_form_request = {
		/** FormID is an ID used to identify the form. The ID is saved by the client and sent back when the player submits the form, so that the server can identify which form was submitted. */
		form_id: number;
		/** FormData is a JSON encoded object of form data. The content of the object differs, depending on the type of the form sent, which is also set in the JSON. */
		data: string;
	};
	/**
	 * ModalFormResponse is sent by the client in response to a ModalFormRequest, after the player has submitted
	 * the form sent. It contains the options/properties selected by the player, or a JSON encoded 'null' if
	 * the form was closed by clicking the X at the top right corner of the form.
	 */
	export type packet_modal_form_response = {
		/** FormID is the form ID of the form the client has responded to. It is the same as the ID sent in the ModalFormRequest, and may be used to identify which form was submitted. */
		form_id: number;
		/** ResponseData is a JSON encoded value representing the response of the player. For a modal form, the response is either true or false, for a menu form, the response is an integer specifying the index of the button clicked, and for a custom form, the response is an array containing a value for each element. */
		data?: string | undefined;
		/** HasResponseData is true if the client provided response data. Versions: 1.19.20 – 1.26.60 */
		has_response_data?: boolean | undefined;
		/** HasCancelReason is true if the client provided a reason for the form being cancelled. Versions: 1.19.20 – 1.26.60 */
		has_cancel_reason?: boolean | undefined;
		/** Versions: 1.19.20 – 1.26.60 */
		cancel_reason?: "closed" | "busy" | number | undefined;
	};
	/**
	 * ServerSettingsRequest is sent by the client to request the settings specific to the server. These settings
	 * are shown in a separate tab client-side, and have the same structure as a custom form.
	 * ServerSettingsRequest has no fields.
	 */
	export type packet_server_settings_request = Record<string, never>;
	export type packet_server_settings_response = {
		form_id: number;
		data: string;
	};
	export type packet_show_profile = {
		xuid: string;
	};
	export type packet_set_default_game_type = {
		gamemode: GameMode;
	};
	export type packet_remove_objective = {
		objective_name: string;
	};
	export type packet_set_display_objective = {
		display_slot: string;
		objective_name: string;
		display_name: string;
		criteria_name: string;
		sort_order: number;
	};
	export type packet_set_score = {
		entries: ScoreEntries | {
			scoreboard_id: bigint;
			objective_name: string;
			score: number;
			entry_type?: "player" | "entity" | "fake_player" | number | undefined;
			entity_unique_id?: bigint | undefined;
			custom_name?: string | undefined;
		}[] | {
			entry_type: "remove" | "player" | "entity" | "fake_player" | number;
			entry_type_name: string;
			scoreboard_id: bigint;
			objective_name?: string | undefined;
			score?: number | undefined;
			custom_name?: string | undefined;
			entity_unique_id?: bigint | undefined;
		}[];
		/** Versions: 1.16.220 – 1.26.30 */
		action?: "change" | "remove" | number | undefined;
	};
	/**
	 * LabTable is sent by the client to let the server know it started a chemical reaction in Education Edition,
	 * and is sent by the server to other clients to show the effects.
	 * The packet is only functional if Education features are enabled.
	 */
	export type packet_lab_table = {
		/** ActionType is the type of the action that was executed. It is one of the constants above. Typically, only LabTableActionCombine is sent by the client, whereas LabTableActionReact is sent by the server. */
		action_type: "combine" | "react" | "reset" | number;
		/** Position is the position at which the lab table used was located. */
		position: vec3i;
		/** ReactionType is the type of the reaction that took place as a result of the items put into the lab table. The reaction type can be either that of an item or a particle, depending on whatever the result was of the reaction. */
		reaction_type: number;
	};
	/**
	 * UpdateBlockSynced is sent by the server to synchronise the falling of a falling block entity with the
	 * transitioning back and forth from and to a solid block. It is used to prevent the entity from flickering,
	 * and is used in places such as the pushing of blocks with pistons.
	 */
	export type packet_update_block_synced = {
		/** Versions: 1.16.201 */
		coordinates?: BlockCoordinates | undefined;
		/** NewBlockRuntimeID is the runtime ID of the block that is placed at Position after sending the packet to the client. */
		block_runtime_id: number;
		/** Versions: 1.16.201 */
		block_priority?: number | undefined;
		/** Versions: 1.16.201 */
		data_layer_id?: number | undefined;
		/** Versions: 1.16.201 */
		unknown0?: number | undefined;
		/** Versions: 1.16.201 */
		unknown1?: number | undefined;
		/** Position is the block position at which a block is updated. Versions: 1.16.210 – 1.26.60 */
		position?: BlockCoordinates | undefined;
		/** Flags is a combination of flags that specify the way the block is updated client-side. It is a combination of the flags above, but typically sending only the BlockUpdateNetwork flag is sufficient. Versions: 1.16.210 – 1.26.60 */
		flags?: UpdateBlockFlags | undefined;
		/** Layer is the world layer on which the block is updated. For most blocks, this is the first layer, as that layer is the default layer to place blocks on, but for blocks inside of each other, this differs. Versions: 1.16.210 – 1.26.60 */
		layer?: number | undefined;
		/** EntityUniqueID is the unique ID of the falling block entity that the block transitions to or that the entity transitions from. Note that for both possible values for TransitionType, the EntityUniqueID should point to the falling block entity involved. Versions: 1.16.210 – 1.26.60 */
		entity_unique_id?: bigint | undefined;
		/** TransitionType is the type of the transition that happened. It is either BlockToEntityTransition, when a block placed becomes a falling entity, or EntityToBlockTransition, when a falling entity hits the ground and becomes a solid block again. Versions: 1.16.210 – 1.26.60 */
		transition_type?: "entity" | "create" | "destroy" | bigint | number | undefined;
	};
	/**
	 * MoveActorDelta is sent by the server to move an entity. The packet is specifically optimised to save as
	 * much space as possible, by only writing non-zero fields.
	 * As of 1.16.100, this packet no longer actually contains any deltas.
	 */
	export type packet_move_entity_delta = {
		/** EntityRuntimeID is the runtime ID of the entity that is being moved. The packet works provided a non-player entity with this runtime ID is present. */
		runtime_entity_id: bigint;
		/** Versions: 1.16.201 – 1.26.30 */
		flags?: DeltaMoveFlags | undefined;
		x?: number | undefined;
		y?: number | undefined;
		z?: number | undefined;
		rot_x?: number | undefined;
		rot_y?: number | undefined;
		rot_z?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		on_ground?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		force_move?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		force_move_local_entity?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		force_completion?: boolean | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		ticks?: bigint | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.26.30
	 */
	export type DeltaMoveFlags = {
		/** Versions: 1.16.201 – 1.26.30 */
		_value: number;
		/** Versions: 1.16.201 – 1.26.30 */
		has_x: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		has_y: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		has_z: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		has_rot_x: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		has_rot_y: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		has_rot_z: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		on_ground: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		teleport: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		force_move: boolean;
	};
	/**
	 * SetScoreboardIdentity is sent by the server to change the identity type of one of the entries on a
	 * scoreboard. This is used to change, for example, an entry pointing to a player, to a fake player when it
	 * leaves the server, and to change it back to a real player when it joins again.
	 * In non-vanilla situations, the packet is quite useless.
	 */
	export type packet_set_scoreboard_identity = {
		/** Entries is a list of all entries in the packet. Each of these entries points to one of the entries on a scoreboard. Depending on ActionType, their identity will either be registered or cleared. */
		entries: ScoreboardIdentityEntries | {
			scoreboard_id: bigint;
			entity_unique_id?: bigint | undefined;
		}[];
		/** ActionType is the type of the action to execute. The action is either ScoreboardIdentityActionRegister to associate an identity with the entry, or ScoreboardIdentityActionClear to remove associations with an entity. Versions: 1.16.220 – 1.26.60 */
		action?: "register_identity" | "clear_identity" | number | undefined;
	};
	/**
	 * SetLocalPlayerAsInitialised is sent by the client in response to a PlayStatus packet with the status set
	 * to spawn. The packet marks the moment at which the client is fully initialised and can receive any packet
	 * without discarding it.
	 */
	export type packet_set_local_player_as_initialized = {
		/** EntityRuntimeID is the entity runtime ID the player was assigned earlier in the login sequence in the StartGame packet. */
		runtime_entity_id: bigint;
	};
	/**
	 * UpdateSoftEnum is sent by the server to update a soft enum, also known as a dynamic enum, previously sent
	 * in the AvailableCommands packet. It is sent whenever the enum should get new options or when some of its
	 * options should be removed.
	 * The UpdateSoftEnum packet will apply for enums that have been set in the AvailableCommands packet with the
	 * 'Dynamic' field of the CommandEnum set to true.
	 */
	export type packet_update_soft_enum = {
		/** EnumType is the type of the enum. This type must be identical to the one set in the AvailableCommands packet, because the client uses this to recognise which enum to update. */
		enum_type: string;
		/** Options is a list of options that should be updated. Depending on the ActionType field, either these options will be added to the enum, the enum options will be set to these options or all of these options will be removed from the enum. */
		options: string[];
		/** ActionType is the type of the action to execute on the enum. The Options field has a different result, depending on what ActionType is used. */
		action_type: "add" | "remove" | "update" | number;
	};
	/**
	 * NetworkStackLatency is sent by the server (and the client, on development builds) to measure the latency
	 * over the entire Minecraft stack, rather than the RakNet latency. It has other usages too, such as the
	 * ability to be used as some kind of acknowledgement packet, to know when the client has received a certain
	 * other packet.
	 */
	export type packet_network_stack_latency = {
		/** Timestamp is the timestamp of the network stack latency packet. The client will, if NeedsResponse is set to true, send a NetworkStackLatency packet with this same timestamp packet in response. */
		timestamp: Int64;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown_flag?: number | undefined;
		/** NeedsResponse specifies if the sending side of this packet wants a response to the packet, meaning that the other side should send a NetworkStackLatency packet back. Versions: 1.16.220 – 1.26.60 */
		needs_response?: number | undefined;
	};
	/**
	 * ScriptCustomEvent is sent by both the client and the server. It is a way to let scripts communicate with
	 * the server, so that the client can let the server know it triggered an event, or the other way around.
	 * It is essentially an RPC kind of system.
	 * Deprecated: ScriptCustomEvent is deprecated as of 1.20.10.
	 */
	export type packet_script_custom_event = {
		/** EventName is the name of the event. The script and the server will use this event name to identify the data that is sent. */
		event_name: string;
		/** EventData is the data of the event. This data is typically a JSON encoded string, that the script is able to encode and decode too. */
		event_data: string;
	};
	/**
	 * SpawnParticleEffect is sent by the server to spawn a particle effect client-side. Unlike other packets that
	 * result in the appearing of particles, this packet can show particles that are not hardcoded in the client.
	 * They can be added and changed through behaviour packs to implement custom particles.
	 */
	export type packet_spawn_particle_effect = {
		/** Versions: 1.16.201 – 1.16.210 */
		dimension_id?: number | undefined;
		/** EntityUniqueID is the unique ID of the entity that the spawned particle may be attached to. If this ID is not -1, the Position below will be interpreted as relative to the position of the entity associated with this unique ID. */
		entity_id: bigint;
		/** Position is the position that the particle should be spawned at. If the position is too far away from the player, it will not show up. If EntityUniqueID is not -1, the position will be relative to the position of the entity. */
		position: vec3f;
		/** ParticleName is the name of the particle that should be shown. This name may point to a particle effect that is built-in, or to one implemented by behaviour packs. */
		particle_name: string;
		/** Dimension is the dimension that the particle is spawned in. Its exact usage is not clear, as the dimension has no direct effect on the particle. Versions: 1.16.220 – 1.26.60 */
		dimension?: number | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		molang_variables?: string | undefined;
	};
	/**
	 * AvailableActorIdentifiers is sent by the server at the start of the game to let the client know all
	 * entities that are available on the server.
	 */
	export type packet_available_entity_identifiers = {
		/** SerialisedEntityIdentifiers is a network NBT serialised compound of all entity identifiers that are available in the server. */
		nbt: NBT;
	};
	/**
	 * Not used. Use `packet_level_sound_event`.
	 */
	export type packet_level_sound_event_v2 = {
		sound_id: number;
		position: vec3f;
		block_id: number;
		entity_type: string;
		is_baby_mob: boolean;
		is_global: boolean;
	};
	/**
	 * NetworkChunkPublisherUpdate is sent by the server to change the point around which chunks are and remain
	 * loaded. This is useful for mini-game servers, where only one area is ever loaded, in which case the
	 * NetworkChunkPublisherUpdate packet can be sent in the middle of it, so that no chunks ever need to be
	 * additionally sent during the course of the game.
	 * In reality, the packet is not extraordinarily useful, and most servers just send it constantly at the
	 * position of the player.
	 * If the packet is not sent at all, no chunks will be shown to the player, regardless of where they are sent.
	 */
	export type packet_network_chunk_publisher_update = {
		/** Position is the block position around which chunks loaded will remain shown to the client. Most servers set this position to the position of the player itself. #TODO: Check putSignedBlockPosition */
		coordinates: BlockCoordinates;
		/** Radius is the radius in blocks around Position that chunks sent show up in and will remain loaded in. Unlike the RequestChunkRadius and ChunkRadiusUpdated packets, this radius is in blocks rather than chunks, so the chunk radius needs to be multiplied by 16. (Or shifted to the left by 4.) */
		radius: number;
		/** Versions: 1.19.20 – 1.26.60 */
		saved_chunks?: {
			/** ChunkX is the X coordinate of the chunk sent. (To translate a block's X to a chunk's X: x >> 4) */
			x: number;
			/** ChunkZ is the Z coordinate of the chunk sent. (To translate a block's Z to a chunk's Z: z >> 4) */
			z: number;
		}[] | undefined;
	};
	/**
	 * BiomeDefinitionList is sent by the server to let the client know all biomes that are available and
	 * implemented on the server side. It is much like the AvailableActorIdentifiers packet, but instead
	 * functions for biomes.
	 */
	export type packet_biome_definition_list = {
		/** Versions: 1.16.201 – 1.21.70 */
		nbt?: NBT | undefined;
		/** BiomeDefinitions is a list of biomes that are available on the server. Versions: 1.21.80 – 1.26.60 */
		biome_definitions?: BiomeDefinition[] | undefined;
		/** StringList is a makeshift dictionary implementation Mojang created to try and reduce the size of the overall packet. It is a list of common strings that are used in the biome definitions. Versions: 1.21.80 – 1.26.60 */
		string_list?: string[] | undefined;
	};
	/**
	 * LevelSoundEvent is sent by the server to make any kind of built-in sound heard to a player. It is sent to,
	 * for example, play a stepping sound or a shear sound. The packet is also sent by the client, in which case
	 * it could be forwarded by the server to the other players online. If possible, the packets from the client
	 * should be ignored however, and the server should play them on its own accord.
	 */
	export type packet_level_sound_event = {
		/** SoundType is the type of the sound to play. Some of the sound types require additional data, which is set in the EventData field. */
		sound_id: number | SoundType | SoundEventIdentifier;
		/** Position is the position of the sound event. The player will be able to hear the direction of the sound based on what position is sent here. */
		position: vec3f;
		/** Versions: 1.16.201 – 1.16.210 */
		block_id?: number | undefined;
		/** EntityType is the string entity type of the entity that emitted the sound, for example 'minecraft:skeleton'. Some sound types use this entity type for additional data. */
		entity_type: string;
		/** BabyMob specifies if the sound should be that of a baby mob. It is most notably used for parrot imitations, which will change based on if this field is set to true or not. */
		is_baby_mob: boolean;
		/** DisableRelativeVolume specifies if the sound should be played relatively or not. If set to true, the sound will have full volume, regardless of where the Position is, whereas if set to false, the sound's volume will be based on the distance to Position. */
		is_global: boolean;
		/** ExtraData is a packed integer that some sound types use to provide extra data. An example of this is the note sound, which is composed of a pitch and an instrument type. Versions: 1.16.220 – 1.26.60 */
		extra_data?: number | undefined;
		/** EntityUniqueID is the unique ID of a source entity. The unique ID is a value that remains consistent across different sessions of the same world, but most servers simply fill the runtime ID of the entity out for this field. Versions: 1.21.70 – 1.26.60 */
		entity_unique_id?: Int64 | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		fire_at_position?: vec3f | undefined;
	};
	/**
	 * LevelEventGeneric is sent by the server to send a 'generic' level event to the client. This packet sends an
	 * NBT serialised object and may for that reason be used for any event holding additional data.
	 */
	export type packet_level_event_generic = {
		/** EventID is a unique identifier that identifies the event called. The data that follows has fields in the NBT depending on what event it is. */
		event_id: number;
		/** SerialisedEventData is a network little endian serialised object of event data, with fields that vary depending on EventID. Unlike many other NBT structures, this data is not actually in a compound but just loosely floating NBT tags. To decode using the nbt package, you would need to append 0x0a00 at the start (compound id and name length) and add 0x00 at the end, to manually wrap it in a compound. Likewise, you would have to remove these bytes when encoding. */
		nbt: NamedTag[];
	};
	/**
	 * LecternUpdate is sent by the client to update the server on which page was opened in a book on a lectern,
	 * or if the book should be removed from it.
	 */
	export type packet_lectern_update = {
		/** Page is the page number in the book that was opened by the player on the lectern. */
		page: number;
		/** PageCount is the number of pages that the book opened in the lectern has. */
		page_count: number;
		/** Position is the position of the lectern that was updated. If no lectern is at the block position, the packet should be ignored. */
		position: vec3i;
		/** Versions: 1.16.201 – 1.20.61 */
		drop_book?: boolean | undefined;
	};
	/**
	 * This packet was removed.
	 */
	export type packet_video_stream_connect = {
		server_uri: string;
		frame_send_frequency: number;
		action: "none" | "close" | number;
		resolution_x: number;
		resolution_y: number;
	};
	/**
	 * Versions: 1.16.201 – 1.20.50
	 */
	export type packet_add_ecs_entity = {
		/** Versions: 1.16.201 – 1.20.50 */
		network_id: bigint;
	};
	/**
	 * Versions: 1.16.201 – 1.20.50
	 */
	export type packet_remove_ecs_entity = {
		/** Versions: 1.16.201 – 1.20.50 */
		network_id: bigint;
	};
	/**
	 * ClientCacheStatus is sent by the client to the server at the start of the game. It is sent to let the
	 * server know if it supports the client-side blob cache. Clients such as Nintendo Switch do not support the
	 * cache, and attempting to use it anyway will fail.
	 */
	export type packet_client_cache_status = {
		/** Enabled specifies if the blob cache is enabled. If false, the server should not attempt to use the blob cache. If true, it may do so, but it may also choose not to use it. */
		enabled: boolean;
	};
	/**
	 * OnScreenTextureAnimation is sent by the server to show a certain animation on the screen of the player.
	 * The packet is used, as an example, for when a raid is triggered and when a raid is defeated.
	 */
	export type packet_on_screen_texture_animation = {
		/** AnimationType is the type of the animation to show. The packet provides no further extra data to allow modifying the duration or other properties of the animation. Versions: 1.16.220 – 1.26.60 */
		animation_type?: number | undefined;
	};
	/**
	 * MapCreateLockedCopy is sent by the server to create a locked copy of one map into another map. In vanilla,
	 * it is used in the cartography table to create a map that is locked and cannot be modified.
	 */
	export type packet_map_create_locked_copy = {
		/** OriginalMapID is the ID of the map that is being copied. The locked copy will obtain all content that is visible on this map, except the content will not change. Versions: 1.16.220 – 1.26.60 */
		original_map_id?: bigint | undefined;
		/** NewMapID is the ID of the map that holds the locked copy of the map that OriginalMapID points to. Its contents will be impossible to change. Versions: 1.16.220 – 1.26.60 */
		new_map_id?: bigint | undefined;
	};
	/**
	 * StructureTemplateDataRequest is sent by the client to request data of a structure.
	 */
	export type packet_structure_template_data_export_request = {
		/** StructureName is the name of the structure that was set in the structure block's UI. This is the name used to export the structure to a file. Versions: 1.16.220 – 1.26.60 */
		name?: string | undefined;
		/** Position is the position of the structure block that has its template data requested. Versions: 1.16.220 – 1.26.60 */
		position?: BlockCoordinates | undefined;
		/** Settings is a struct of settings that should be used for exporting the structure. These settings are identical to the last sent in the StructureBlockUpdate packet by the client. Versions: 1.16.220 – 1.26.60 */
		settings?: StructureBlockSettings | undefined;
		/** RequestType specifies the type of template data request that the player sent. Versions: 1.16.220 – 1.26.60 */
		request_type?: "export_from_save" | "export_from_load" | "query_saved_structure" | number | "import_from_save" | undefined;
	};
	/**
	 * StructureTemplateDataResponse is sent by the server to send data of a structure to the client in response
	 * to a StructureTemplateDataRequest packet.
	 */
	export type packet_structure_template_data_export_response = {
		/** Versions: 1.16.220 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		success?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		nbt?: NBT | undefined;
		/** ResponseType specifies the response type of the packet. This depends on the RequestType field sent in the StructureTemplateDataRequest packet and is one of the constants above. Versions: 1.16.220 – 1.26.60 */
		response_type?: "export" | "query" | number | "import" | undefined;
	};
	/**
	 * No longer used.
	 */
	export type packet_update_block_properties = {
		nbt: NBT;
	};
	/**
	 * ClientCacheBlobStatus is part of the blob cache protocol. It is sent by the client to let the server know
	 * what blobs it needs and which blobs it already has, in an ACK type system.
	 */
	export type packet_client_cache_blob_status = {
		/** Versions: 1.16.201 – 1.26.20 */
		misses?: number | undefined;
		/** Versions: 1.16.201 – 1.26.20 */
		haves?: number | undefined;
		/** A list of blob hashes that the client does not have a blob available for. The server should send the blobs matching these hashes as soon as possible. */
		missing: Int64[];
		/** A list of hashes that the client does have a cached blob for. Server doesn't need to send. */
		have: Int64[];
	};
	/**
	 * ClientCacheMissResponse is part of the blob cache protocol. It is sent by the server in response to a
	 * ClientCacheBlobStatus packet and contains the blob data of all blobs that the client acknowledged not to
	 * have yet.
	 */
	export type packet_client_cache_miss_response = {
		blobs: Blob[];
	};
	/**
	 * EducationSettings is a packet sent by the server to update Minecraft: Education Edition related settings.
	 * It is unused by the normal base game.
	 */
	export type packet_education_settings = {
		/** CodeBuilderDefaultURI is the default URI that the code builder is ran on. Using this, a Code Builder program can make code directly affect the server. */
		CodeBuilderDefaultURI: string;
		/** CodeBuilderTitle is the title of the code builder shown when connected to the CodeBuilderDefaultURI. */
		CodeBuilderTitle: string;
		/** CanResizeCodeBuilder specifies if clients connected to the world should be able to resize the code builder when it is opened. */
		CanResizeCodeBuilder: boolean;
		HasOverrideURI: boolean;
		OverrideURI?: string | undefined;
		HasQuiz: boolean;
		/** Versions: 1.17.30 – 1.26.60 */
		disable_legacy_title_bar?: boolean | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		post_process_filter?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		screenshot_border_path?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		has_agent_capabilities?: boolean | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		agent_capabilities?: {
			has?: boolean | undefined;
			can_modify_blocks?: boolean | undefined;
		} | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		has_external_link_settings?: boolean | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		external_link_settings?: {
			has: boolean;
			url: string;
			display_name: string;
		} | undefined;
	};
	/**
	 * Emote is sent by both the server and the client. When the client sends an emote, it sends this packet to
	 * the server, after which the server will broadcast the packet to other players online.
	 */
	export type packet_emote = {
		/** EntityRuntimeID is the entity that sent the emote. When a player sends this packet, it has this field set as its own entity runtime ID. */
		entity_id: bigint;
		/** EmoteID is the ID of the emote to send. */
		emote_id: string;
		/** Flags is a combination of flags that change the way the Emote packet operates. When the server sends this packet to other players, EmoteFlagServerSide must be present. */
		flags: number | "server_side" | "mute_chat";
		/** XUID is the Xbox User ID of the player that sent the emote. It is only set when the emote is used by a player that is authenticated with Xbox Live. Versions: 1.20.0 – 1.26.60 */
		xuid?: string | undefined;
		/** PlatformID is an identifier only set for particular platforms when using an emote (presumably only for Nintendo Switch). It is otherwise an empty string, and is used to decide which players are able to emote with each other. Versions: 1.20.0 – 1.26.60 */
		platform_id?: string | undefined;
		/** EmoteLength is the number of ticks that the emote lasts for. Versions: 1.21.30 – 1.26.60 */
		emote_length_ticks?: number | undefined;
	};
	/**
	 * MultiPlayerSettings is sent by the client to update multi-player related settings server-side and sent back
	 * to online players by the server.
	 * The MultiPlayerSettings packet is a Minecraft: Education Edition packet. It has no functionality for the
	 * base game.
	 */
	export type packet_multiplayer_settings = {
		/** ActionType is the action that should be done when this packet is sent. It is one of the constants that may be found above. */
		action_type: "enable_multiplayer" | "disable_multiplayer" | "refresh_join_code" | number;
	};
	/**
	 * SettingsCommand is sent by the client when it changes a setting in the settings that results in the issuing
	 * of a command to the server, such as when Show Coordinates is enabled.
	 */
	export type packet_settings_command = {
		/** CommandLine is the full command line that was sent to the server as a result of the setting that the client changed. */
		command_line: string;
		/** SuppressOutput specifies if the client requests the suppressing of the output of the command that was executed. Generally this is set to true, as the client won't need a message to confirm the output of the change. */
		suppress_output: boolean;
	};
	/**
	 * AnvilDamage is sent by the client to request the dealing damage to an anvil. This packet is completely
	 * pointless and the server should never listen to it.
	 */
	export type packet_anvil_damage = {
		/** Versions: 1.16.201 – 1.26.30 */
		damage?: number | undefined;
		/** AnvilPosition is the position in the world that the anvil can be found at. */
		position: BlockCoordinates;
	};
	/**
	 * CompletedUsingItem is sent by the server to tell the client that it should be done using the item it is
	 * currently using.
	 */
	export type packet_completed_using_item = {
		/** UsedItemID is the item ID of the item that the client completed using. This should typically be the ID of the item held in the hand. */
		used_item_id: number;
		/** UseMethod is the method of the using of the item that was completed. It is one of the constants that may be found above. */
		use_method: "equip_armor" | "eat" | "attack" | "consume" | "throw" | "shoot" | "place" | "fill_bottle" | "fill_bucket" | "pour_bucket" | "use_tool" | "interact" | "retrieved" | "dyed" | "traded" | number | "brushing_completed" | "opened_vault";
	};
	/**
	 * NetworkSettings is sent by the server to update a variety of network settings. These settings modify the
	 * way packets are sent over the network stack.
	 */
	export type packet_network_settings = {
		/** CompressionThreshold is the minimum size of a packet that is compressed when sent. If the size of a packet is under this value, it is not compressed. When set to 0, all packets will be left uncompressed. */
		compression_threshold: number;
		/** CompressionAlgorithm is the algorithm that is used to compress packets. Versions: 1.19.30 – 1.26.60 */
		compression_algorithm?: "deflate" | "snappy" | number | undefined;
		/** ClientThrottle regulates whether the client should throttle players when exceeding of the threshold. Players outside threshold will not be ticked, improving performance on low-end devices. Versions: 1.19.30 – 1.26.60 */
		client_throttle?: boolean | undefined;
		/** ClientThrottleThreshold is the threshold for client throttling. If the number of players exceeds this value, the client will throttle players. Versions: 1.19.30 – 1.26.60 */
		client_throttle_threshold?: number | undefined;
		/** ClientThrottleScalar is the scalar for client throttling. The scalar is the amount of players that are ticked when throttling is enabled. Versions: 1.19.30 – 1.26.60 */
		client_throttle_scalar?: number | undefined;
	};
	/**
	 * PlayerAuthInput is sent by the client to allow for server authoritative movement. It is used to synchronise
	 * the player input with the position server-side.
	 * The client sends this packet when the ServerAuthoritativeMovementMode field in the StartGame packet is set
	 * to true, instead of the MovePlayer packet. The client will send this packet once every tick.
	 */
	export type packet_player_auth_input = {
		/** Pitch that the player reports it has. */
		pitch: number;
		/** Yaw that player reports it has. */
		yaw: number;
		/** Position holds the position that the player reports it has. */
		position: vec3f;
		/** MoveVector is a Vec2 that specifies the direction in which the player moved, as a combination of X/Z values which are created using the WASD/controller stick state. */
		move_vector: vec2f;
		/** HeadYaw is the horizontal rotation of the head that the player reports it has. */
		head_yaw: number;
		/** InputData specifies the way the player moved last tick. As of 1.26.40 it is an optional list of InputData values instead of a bitfield. */
		input_data?: InputFlag | InputData[] | undefined;
		/** InputMode specifies the way that the client inputs data to the screen. It is one of the constants that may be found above. */
		input_mode: "mouse" | "touch" | "game_pad" | "motion_controller" | number | "unknown";
		/** PlayMode specifies the way that the player is playing. The values it holds, which are rather random, may be found above. */
		play_mode: "normal" | "teaser" | "screen" | "viewer" | "reality" | "placement" | "living_room" | "exit_level" | "exit_level_living_room" | "num_modes" | number;
		/** Versions: 1.16.201 – 1.21.30 */
		gaze_direction?: vec3f | undefined;
		/** Tick is the server tick at which the packet was sent. It is used in relation to CorrectPlayerMovePrediction. */
		tick: bigint;
		/** Delta was the delta between the old and the new position. There isn't any practical use for this field as it can be calculated by the server itself. */
		delta: vec3f;
		/** Versions: 1.16.210 – 1.26.60 */
		transaction?: {
			legacy: TransactionLegacy | TransactionLegacyAuthInput;
			actions?: TransactionActions | TransactionActionsAuthInput | undefined;
			data: TransactionUseItem;
			actions_presence?: boolean | undefined;
		} | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		item_stack_request?: ItemStackRequest | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		block_action?: {
			action: Action;
			position?: vec3i | undefined;
			face?: number | undefined;
		}[] | undefined;
		/** InteractionModel is a constant representing the interaction model the player is using. Versions: 1.19.1 – 1.26.60 */
		interaction_model?: "touch" | "crosshair" | "classic" | number | undefined;
		/** AnalogueMoveVector is a Vec2 that specifies the direction in which the player moved, as a combination of X/Z values which are created using an analogue input. Versions: 1.19.70 – 1.26.60 */
		analogue_move_vector?: vec2f | undefined;
		/** Versions: 1.20.61 – 1.26.60 */
		predicted_vehicle?: bigint | undefined;
		/** Versions: 1.20.71 – 1.26.60 */
		vehicle_rotation?: vec2f | undefined;
		/** interact_rotation is the rotation the player is looking that they intend to use for interactions. This is only different to Pitch and Yaw in cases such as VR or when custom cameras being used. Versions: 1.21.42 – 1.26.60 */
		interact_rotation?: vec2f | undefined;
		/** CameraOrientation is the vector that represents the camera's forward direction which can be used to transform movement to be camera relative. Versions: 1.21.42 – 1.26.60 */
		camera_orientation?: vec3f | undefined;
		/** RawMoveVector is the value of MoveVector before it is affected by input permissions, sneaking/fly speeds and isn't normalised for analogue inputs. Versions: 1.21.50 – 1.26.60 */
		raw_move_vector?: vec2f | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		transaction_presence?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		item_stack_request_presence?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		block_action_presence?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		vehicle_rotation_presence?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		predicted_vehicle_presence?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.26.30
	 */
	export type InputFlag = {
		/** Versions: 1.16.201 – 1.26.30 */
		_value: number | bigint;
		/** Versions: 1.16.201 – 1.26.30 */
		ascend: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		descend: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		north_jump: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		jump_down: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		sprint_down: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		change_height: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		jumping: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		auto_jumping_in_water: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		sneaking: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		sneak_down: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		up: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		down: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		left: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		right: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		up_left: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		up_right: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		want_up: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		want_down: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		want_down_slow: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		want_up_slow: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		sprinting: boolean;
		/** Versions: 1.16.201 – 1.17.0 */
		ascend_scaffolding?: boolean | undefined;
		/** Versions: 1.16.201 – 1.17.0 */
		descend_scaffolding?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		sneak_toggle_down: boolean;
		/** Versions: 1.16.201 – 1.26.30 */
		persist_sneak: boolean;
		/** Versions: 1.16.210 – 1.26.30 */
		start_sprinting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		stop_sprinting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_sneaking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		stop_sneaking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_swimming?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		stop_swimming?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_jumping?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_gliding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		stop_gliding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		item_interact?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		block_action?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		item_stack_request?: boolean | undefined;
		/** Versions: 1.17.10 – 1.26.30 */
		ascend_block?: boolean | undefined;
		/** Versions: 1.17.10 – 1.26.30 */
		descend_block?: boolean | undefined;
		/** Versions: 1.19.60 – 1.26.30 */
		handled_teleport?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.30 */
		emoting?: boolean | undefined;
		/** Versions: 1.20.10 – 1.26.30 */
		missed_swing?: boolean | undefined;
		/** Versions: 1.20.10 – 1.26.30 */
		start_crawling?: boolean | undefined;
		/** Versions: 1.20.10 – 1.26.30 */
		stop_crawling?: boolean | undefined;
		/** Versions: 1.20.30 – 1.26.30 */
		start_flying?: boolean | undefined;
		/** Versions: 1.20.30 – 1.26.30 */
		stop_flying?: boolean | undefined;
		/** Versions: 1.20.40 – 1.26.30 */
		received_server_data?: boolean | undefined;
		/** Versions: 1.20.61 – 1.26.30 */
		client_predicted_vehicle?: boolean | undefined;
		/** Versions: 1.20.71 – 1.26.30 */
		paddling_left?: boolean | undefined;
		/** Versions: 1.20.71 – 1.26.30 */
		paddling_right?: boolean | undefined;
		/** Versions: 1.21.0 – 1.26.30 */
		block_breaking_delay_enabled?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.30 */
		horizontal_collision?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.30 */
		vertical_collision?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.30 */
		down_left?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.30 */
		down_right?: boolean | undefined;
		/** Versions: 1.21.42 – 1.26.30 */
		camera_relative_movement_enabled?: boolean | undefined;
		/** Versions: 1.21.42 – 1.26.30 */
		rot_controlled_by_move_direction?: boolean | undefined;
		/** Versions: 1.21.42 – 1.26.30 */
		start_spin_attack?: boolean | undefined;
		/** Versions: 1.21.42 – 1.26.30 */
		stop_spin_attack?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		start_using_item?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		hotbar_only_touch?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		jump_released_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		jump_pressed_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		jump_current_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		sneak_released_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		sneak_pressed_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		sneak_current_raw?: boolean | undefined;
	};
	/**
	 * CreativeContent is a packet sent by the server to set the creative inventory's content for a player.
	 * Introduced in 1.16, this packet replaces the previous method - sending an InventoryContent packet with
	 * creative inventory window ID.
	 * As of v1.16.100, this packet must be sent during the login sequence. Not sending it will stop the client
	 * from joining the server.
	 */
	export type packet_creative_content = {
		/** Individual items that are displayed within the creative inventory menu, grouped by their category. */
		items: ItemStacks | {
			/** The index of the item in the creative menu. */
			entry_id: number;
			item: ItemLegacy;
		}[] | {
			/** The index of the item in the creative menu. */
			entry_id: number;
			item: ItemLegacy;
			/** The group index of the item - which group in the groups array this item belongs to. */
			group_index: number;
		}[];
		/** The groups that are displayed within the creative inventory menu. Versions: 1.21.60 – 1.26.60 */
		groups?: {
			/** Where the group shows up in the creative inventory (e.g. Construction, Items, etc) As of 1.26.40 this is a single byte instead of a little endian int. */
			category: "all" | "construction" | "nature" | "equipment" | "items" | "item_command_only" | number;
			/** The name of the group (e.g. Decorative stone, Wool, etc.) */
			name: string;
			/** The item whose icon is used to label the group (icon you click on to open/close the group) */
			icon_item: ItemLegacy;
		}[] | undefined;
	};
	/**
	 * PlayerEnchantOptions is sent by the server to update the enchantment options displayed when the user opens
	 * the enchantment table and puts an item in. This packet was added in 1.16 and allows the server to decide on
	 * the enchantments that can be selected by the player.
	 * The PlayerEnchantOptions packet should be sent once for every slot update of the enchantment table. The
	 * vanilla server sends an empty PlayerEnchantOptions packet when the player opens the enchantment table
	 * (air is present in the enchantment table slot) and sends the packet with actual enchantments in it when
	 * items are put in that can have enchantments.
	 */
	export type packet_player_enchant_options = {
		/** Versions: 1.16.201 – 1.16.210 */
		enchant_options?: EnchantOptions | undefined;
		/** Options is a list of possible enchantment options for the item that was put into the enchantment table. Versions: 1.16.220 – 1.26.60 */
		options?: EnchantOption[] | undefined;
	};
	/**
	 * ItemStackRequest is sent by the client to change item stacks in an inventory. It is essentially a
	 * replacement of the InventoryTransaction packet added in 1.16 for inventory specific actions, such as moving
	 * items around or crafting. The InventoryTransaction packet is still used for actions such as placing blocks
	 * and interacting with entities.
	 */
	export type packet_item_stack_request = {
		requests: ItemStackRequests | ItemStackRequest[];
	};
	/**
	 * ItemStackResponse is sent by the server in response to an ItemStackRequest packet from the client. This
	 * packet is used to either approve or reject ItemStackRequests from the client. If a request is approved, the
	 * client will simply continue as normal. If rejected, the client will undo the actions so that the inventory
	 * should be in sync with the server again.
	 */
	export type packet_item_stack_response = {
		/** Responses is a list of responses to ItemStackRequests sent by the client before. Responses either approve or reject a request from the client. Vanilla limits the size of this slice to 4096. */
		responses: ItemStackResponses;
	};
	/**
	 * PlayerArmourDamage is sent by the server to damage the armour of a player. It is a very efficient packet,
	 * but generally it's much easier to just send a slot update for the damaged armour.
	 */
	export type packet_player_armor_damage = {
		/** Versions: 1.16.201 – 1.21.100 */
		type?: ArmorDamageType | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		helmet_damage?: number | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		chestplate_damage?: number | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		leggings_damage?: number | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		boots_damage?: number | undefined;
		/** Versions: 1.21.20 – 1.21.100 */
		body_damage?: number | undefined;
		/** Versions: 1.21.111 – 1.26.60 */
		entries?: ArmorDamageEntry[] | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.21.100
	 */
	export type ArmorDamageType = {
		/** Versions: 1.16.201 – 1.21.100 */
		_value: number;
		/** Versions: 1.16.201 – 1.21.100 */
		head: boolean;
		/** Versions: 1.16.201 – 1.21.100 */
		chest: boolean;
		/** Versions: 1.16.201 – 1.21.100 */
		legs: boolean;
		/** Versions: 1.16.201 – 1.21.100 */
		feet: boolean;
		/** Versions: 1.21.20 – 1.21.100 */
		body?: boolean | undefined;
	};
	/**
	 * CodeBuilder is an Education Edition packet sent by the server to the client to open the URL to a Code
	 * Builder (websocket) server.
	 */
	export type packet_code_builder = {
		/** URL is the url to the Code Builder (websocket) server. */
		url: string;
		/** ShouldOpenCodeBuilder specifies if the client should automatically open the Code Builder app. If set to true, the client will attempt to use the Code Builder app to connect to and interface with the server running at the URL above. */
		should_open_code_builder: boolean;
	};
	/**
	 * UpdatePlayerGameType is sent by the server to change the game mode of a player. It is functionally
	 * identical to the SetPlayerGameType packet.
	 */
	export type packet_update_player_game_type = {
		/** GameType is the new game type of the player. It is one of the constants that can be found in set_player_game_type.go. Some of these game types require additional flags to be set in an AdventureSettings packet for the game mode to obtain its full functionality. */
		gamemode: GameMode;
		/** PlayerUniqueID is the entity unique ID of the player that should have its game mode updated. If this packet is sent to other clients with the player unique ID of another player, nothing happens. */
		player_unique_id: bigint;
		/** Versions: 1.20.80 – 1.26.60 */
		tick?: number | bigint | undefined;
	};
	/**
	 * EmoteList is sent by the client every time it joins the server and when it equips new emotes. It may be
	 * used by the server to find out which emotes the client has available. If the player has no emotes equipped,
	 * this packet is not sent.
	 * Under certain circumstances, this packet is also sent from the server to the client, but I was unable to
	 * find when this is done.
	 */
	export type packet_emote_list = {
		/** PlayerRuntimeID is the runtime ID of the player that owns the emote pieces below. If sent by the client, this player runtime ID is always that of the player itself. */
		player_id: bigint;
		/** EmotePieces is a list of emote pieces that the player with the runtime ID above has. */
		emote_pieces: string[];
	};
	/**
	 * PositionTrackingDBClientRequest is a packet sent by the client to request the position and dimension of a
	 * 'tracking ID'. These IDs are tracked in a database by the server. In 1.16, this is used for lodestones.
	 * The client will send this request to find the position a lodestone compass needs to point to. If found, it
	 * will point to the lodestone. If not, it will start spinning around.
	 * A PositionTrackingDBServerBroadcast packet should be sent in response to this packet.
	 */
	export type packet_position_tracking_db_request = {
		/** RequestAction is the action that should be performed upon the receiving of the packet. It is one of the constants found above. */
		action: "query" | number;
		/** TrackingID is a unique ID used to identify the request. The server responds with a PositionTrackingDBServerBroadcast packet holding the same ID, so that the client can find out what that packet was in response to. */
		tracking_id: number;
	};
	/**
	 * PositionTrackingDBServerBroadcast is sent by the server in response to the
	 * PositionTrackingDBClientRequest packet. This packet is, as of 1.16, currently only used for lodestones. The
	 * server maintains a database with tracking IDs and their position and dimension. The client will request
	 * these tracking IDs, (NBT tag set on the lodestone compass with the tracking ID?) and the server will
	 * respond with the status of those tracking IDs.
	 * What is actually done with the data sent depends on what the client chooses to do with it. For the
	 * lodestone compass, it is used to make the compass point towards lodestones and to make it spin if the
	 * lodestone at a position is no longer there.
	 */
	export type packet_position_tracking_db_broadcast = {
		/** BroadcastAction specifies the status of the position tracking DB response. It is one of the constants above, specifying the result of the request with the ID below. The Update action is sent for setting the position of a lodestone compass, the Destroy and NotFound to indicate that there is not (no longer) a lodestone at that position. */
		broadcast_action: "update" | "destory" | "not_found" | number;
		/** TrackingID is the ID of the PositionTrackingDBClientRequest packet that this packet was in response to. The tracking ID is also present as the 'id' field in the SerialisedData field. */
		tracking_id: number;
		nbt: NBT;
	};
	/**
	 * DebugInfo is a packet sent by the server to the client. It does not seem to do anything when sent to the
	 * normal client in 1.16.
	 */
	export type packet_debug_info = {
		/** PlayerUniqueID is the unique ID of the player that the packet is sent to. */
		player_unique_id: bigint;
		/** Data is the debug data. */
		data: ByteArray;
	};
	/**
	 * PacketViolationWarning is sent by the client when it receives an invalid packet from the server. It holds
	 * some information on the error that occurred.
	 */
	export type packet_packet_violation_warning = {
		violation_type: "malformed" | number;
		/** Severity specifies the severity of the packet violation. The action the client takes after this violation depends on the severity sent. */
		severity: "warning" | "final_warning" | "terminating" | number;
		/** PacketID is the ID of the invalid packet that was received. */
		packet_id: number;
		/** ViolationContext holds a description on the violation of the packet. */
		reason: string;
	};
	/**
	 * MotionPredictionHints is sent by the server to the client. There is a predictive movement component for
	 * entities. This packet fills the "history" of that component and entity movement is computed based on the
	 * points. Vanilla sends this packet instead of the SetActorMotion packet when 'spatial optimisations' are
	 * enabled.
	 */
	export type packet_motion_prediction_hints = {
		/** EntityRuntimeID is the runtime ID of the entity whose velocity is sent to the client. */
		entity_runtime_id: bigint;
		/** Velocity is the server-calculated velocity of the entity at the point of sending the packet. */
		velocity: vec3f;
		/** OnGround specifies if the server currently thinks the entity is on the ground. */
		on_ground: boolean;
	};
	/**
	 * AnimateEntity is sent by the server to animate an entity client-side. It may be used to play a single
	 * animation, or to activate a controller which can start a sequence of animations based on different
	 * conditions specified in an animation controller.
	 * Much of the documentation of this packet can be found at
	 * https://learn.microsoft.com/minecraft/creator/reference/content/animationsreference.
	 */
	export type packet_animate_entity = {
		/** Animation is the name of a single animation to start playing. */
		animation: string;
		/** NextState is the first state to start with. These states are declared in animation controllers (which, in themselves, are animations too). These states in turn may have animations and transitions to move to a next state. */
		next_state: string;
		/** StopCondition is a MoLang expression that specifies when the animation should be stopped. */
		stop_condition: string;
		/** Controller is the animation controller that is used to manage animations. These controllers decide when to play which animation. */
		controller: string;
		/** How long to move from the previous animation to the next. */
		blend_out_time: number;
		/** EntityRuntimeIDs is list of runtime IDs of entities that the animation should be applied to. */
		runtime_entity_ids: bigint[];
		/** StopConditionVersion is the MoLang stop condition version. Versions: 1.17.30 – 1.26.60 */
		stop_condition_version?: Int64 | number | undefined;
	};
	/**
	 * CameraShake is sent by the server to make the camera shake client-side. This feature was added for map-
	 * making partners.
	 */
	export type packet_camera_shake = {
		/** Intensity is the intensity of the shaking. The client limits this value to 4, so anything higher may not work. */
		intensity: number;
		/** Duration is the number of seconds the camera will shake for. */
		duration: number;
		/** Type is the type of shake, and is one of the constants listed above. The different type affects how the shake looks in game. */
		type: number;
		/** Action is the action to be performed, and is one of the constants listed above. Currently the different actions will either add or stop shaking the client. Versions: 1.16.210 – 1.26.60 */
		action?: "add" | "stop" | number | undefined;
	};
	/**
	 * PlayerFog is sent by the server to render the different fogs in the Stack. The types of fog are controlled
	 * by resource packs to change how they are rendered, and the ability to create custom fog.
	 */
	export type packet_player_fog = {
		/** Stack is a list of fog identifiers to be sent to the client. Examples of fog identifiers are "minecraft:fog_ocean" and "minecraft:fog_hell". */
		stack: string[];
	};
	/**
	 * CorrectPlayerMovePrediction is sent by the server if and only if StartGame.ServerAuthoritativeMovementMode
	 * is set to AuthoritativeMovementModeServerWithRewind. The packet is used to correct movement at a specific
	 * point in time.
	 */
	export type packet_correct_player_move_prediction = {
		/** Position is the position that the player is supposed to be at at the tick written in the field below. The client will change its current position based on movement after that tick starting from the Position. */
		position: vec3f;
		/** Delta is the change in position compared to what the client sent as its position at that specific tick. */
		delta: vec3f;
		/** OnGround specifies if the player was on the ground at the time of the tick below. */
		on_ground: boolean;
		/** Tick is the tick of the movement which was corrected by this packet. */
		tick: bigint;
		/** Versions: 1.20.80 – 1.26.60 */
		prediction_type?: "player" | "vehicle" | number | undefined;
		/** Versions: 1.20.80 – 1.21.93 */
		vehicle_rotation?: vec2f | {
			rotation: vec2f;
			angular_velocity?: number | undefined;
		} | undefined;
		/** Versions: 1.21.100 – 1.26.60 */
		rotation?: vec2f | undefined;
		/** Versions: 1.21.100 – 1.26.60 */
		angular_velocity?: number | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.21.50
	 */
	export type packet_item_component = {
		/** Versions: 1.16.201 – 1.21.50 */
		entries: ItemComponentList;
	};
	/**
	 * FilterText is sent by the both the client and the server. The client sends the packet to the server to
	 * allow the server to filter the text server-side. The server then responds with the same packet and the
	 * safer version of the text.
	 */
	export type packet_filter_text_packet = {
		/** Text is either the text from the client or the safer version of the text sent by the server. */
		text: string;
		/** FromServer indicates if the packet was sent by the server or not. */
		from_server: boolean;
	};
	/**
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type MetadataFlags1 = {
		/** Versions: 1.16.210 – 1.26.60 */
		_value: bigint;
		/** Versions: 1.16.210 – 1.26.60 */
		onfire: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		sneaking: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		riding: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		sprinting: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		action: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		invisible: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		tempted: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		inlove: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		saddled: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		powered: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		ignited: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		baby: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		converting: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		critical: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		can_show_nametag: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		always_show_nametag: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		no_ai: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		silent: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		wallclimbing: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		can_climb: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		swimmer: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		can_fly: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		walker: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		resting: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		sitting: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		angry: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		interested: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		charged: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		tamed: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		orphaned: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		leashed: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		sheared: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		gliding: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		elder: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		moving: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		breathing: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		chested: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		stackable: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		showbase: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		rearing: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		vibrating: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		idling: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		evoker_spell: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		charge_attack: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		wasd_controlled: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		can_power_jump: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		linger: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		has_collision: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		affected_by_gravity: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		fire_immune: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		dancing: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		enchanted: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		show_trident_rope: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		container_private: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		transforming: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		spin_attack: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		swimming: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		bribed: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		pregnant: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		laying_egg: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		rider_can_pick: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		transition_sitting: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		eating: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		laying_down: boolean;
		/** Versions: 1.19.50 – 1.26.60 */
		can_dash?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type MetadataFlags2 = {
		/** Versions: 1.16.210 – 1.26.60 */
		_value: bigint;
		/** Versions: 1.16.210 – 1.26.60 */
		sneezing: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		trusting: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		rolling: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		scared: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		in_scaffolding: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		over_scaffolding: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		fall_through_scaffolding: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		blocking: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		transition_blocking: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		blocked_using_shield: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		blocked_using_damaged_shield: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		sleeping: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		wants_to_wake: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		trade_interest: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		door_breaker: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		breaking_obstruction: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		door_opener: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		illager_captain: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		stunned: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		roaring: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		delayed_attacking: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		avoiding_mobs: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		avoiding_block: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		facing_target_to_range_attack: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		hidden_when_invisible: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		is_in_ui: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		stalking: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		emoting: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		celebrating: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		admiring: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		celebrating_special: boolean;
		/** Versions: 1.17.0 – 1.26.60 */
		unknown95?: boolean | undefined;
		/** Versions: 1.17.0 – 1.26.60 */
		ram_attack?: boolean | undefined;
		/** Versions: 1.17.0 – 1.26.60 */
		playing_dead?: boolean | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		in_ascendable_block?: boolean | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		over_descendable_block?: boolean | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		croaking?: boolean | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		eat_mob?: boolean | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		jump_goal_jump?: boolean | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		emerging?: boolean | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		sniffing?: boolean | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		digging?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		sonic_boom?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		has_dash_cooldown?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		push_towards_closest_space?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		scenting?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		rising?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		feeling_happy?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		searching?: boolean | undefined;
		/** Versions: 1.20.10 – 1.26.60 */
		crawling?: boolean | undefined;
		/** Versions: 1.20.40 – 1.26.60 */
		timer_flag_1?: boolean | undefined;
		/** Versions: 1.20.40 – 1.26.60 */
		timer_flag_2?: boolean | undefined;
		/** Versions: 1.20.40 – 1.26.60 */
		timer_flag_3?: boolean | undefined;
		/** Versions: 1.20.80 – 1.26.60 */
		body_rotation_blocked?: boolean | undefined;
		/** Versions: 1.21.60 – 1.26.60 */
		render_when_invisible?: boolean | undefined;
		/** Versions: 1.21.70 – 1.26.60 */
		body_rotation_axis_aligned?: boolean | undefined;
		/** Versions: 1.21.70 – 1.26.60 */
		collidable?: boolean | undefined;
		/** Versions: 1.21.70 – 1.26.60 */
		wasd_air_controlled?: boolean | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		does_server_auth_only_dismount?: boolean | undefined;
		/** Versions: 1.21.90 – 1.26.60 */
		body_rotation_always_follows_head?: boolean | undefined;
		/** Versions: 1.21.111 – 1.26.60 */
		can_use_vertical_movement_action?: boolean | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		rotation_locked_to_vehicle?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		uses_legacy_friction?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		uses_uniform_air_drag?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		nameplate_depth_tested?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		not_pickable_from_inside?: boolean | undefined;
	};
	/**
	 * UseItemTransactionData represents an inventory transaction data object sent when the client uses an item on
	 * a block. Also used in PlayerAuthoritativeInput packet
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type TransactionUseItem = {
		/** ActionType is the type of the UseItem inventory transaction. It is one of the action types found above, and specifies the way the player interacted with the block. Versions: 1.16.210 – 1.26.60 */
		action_type: "click_block" | "click_air" | "break_block" | number | "attack";
		/** BlockPosition is the position of the block that was interacted with. This is only really a correct block position if ActionType is not UseItemActionClickAir. Versions: 1.16.210 – 1.26.60 */
		block_position: BlockCoordinates;
		/** BlockFace is the face of the block that was interacted with. When clicking the block, it is the face clicked. When breaking the block, it is the face that was last being hit until the block broke. Versions: 1.16.210 – 1.26.60 */
		face: number;
		/** HotBarSlot is the hot bar slot that the player was holding while clicking the block. It should be used to ensure that the hot bar slot and held item are correctly synchronised with the server. Versions: 1.16.210 – 1.26.60 */
		hotbar_slot: number;
		/** HeldItem is the item that was held to interact with the block. The server should check if this item is actually present in the HotBarSlot. Versions: 1.16.210 – 1.26.60 */
		held_item: Item | ItemV4;
		/** Position is the position of the player at the time of interaction. For clicking a block, this is the position at that time, whereas for breaking the block it is the position at the time of breaking. Versions: 1.16.210 – 1.26.60 */
		player_pos: vec3f;
		/** ClickedPosition is the position that was clicked relative to the block's base coordinate. It can be used to find out exactly where a player clicked the block. Versions: 1.16.210 – 1.26.60 */
		click_pos: vec3f;
		/** BlockRuntimeID is the runtime ID of the block that was clicked. It may be used by the server to verify that the player's world client-side is synchronised with the server's. Versions: 1.16.210 – 1.26.60 */
		block_runtime_id: number;
		/** TriggerType is the type of the trigger that caused the inventory transaction. It is one of the trigger types found in the constants above. If TriggerType is TriggerTypePlayerInput, the transaction is from the initial input of the player. If it is TriggerTypeSimulationTick, the transaction is from a simulation tick when the player is holding down the input. Versions: 1.21.20 – 1.26.60 */
		trigger_type?: "unknown" | "player_input" | "simulation_tick" | number | undefined;
		/** ClientPrediction is the client's prediction on the output of the transaction. Versions: 1.21.20 – 1.26.60 */
		client_prediction?: "failure" | "success" | number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		client_cooldown_state?: "off" | "on" | number | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		hand?: "main_hand" | "off_hand" | number | undefined;
	};
	/**
	 * Actions is a list of actions that took place, that form the inventory transaction together. Each of
	 * these actions hold one slot in which one item was changed to another. In general, the combination of
	 * all of these actions results in a balanced inventory transaction. This should be checked to ensure that
	 * no items are cheated into the inventory.
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type TransactionActions = {
		/** Versions: 1.16.210 */
		network_ids: boolean;
		/** Versions: 1.16.210 */
		actions: {
			source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
			inventory_id?: number | undefined;
			action?: number | undefined;
			flags?: number | undefined;
			slot: number;
			old_item: Item;
			new_item: Item;
			new_item_stack_id?: number | undefined;
		}[];
	} | {
		source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
		inventory_id?: WindowIDZigzag32 | undefined;
		action?: number | undefined;
		flags?: number | undefined;
		slot: number;
		old_item: Item;
		new_item: Item;
	}[] | {
		source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
		container_presence: boolean;
		window_id?: number | undefined;
		flag_presence: boolean;
		flags?: number | undefined;
		slot: number;
		old_item: ItemV4;
		new_item: ItemV4;
	}[] | {
		source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
		window_id?: number | undefined;
		flags?: number | undefined;
		slot: number;
		old_item: ItemV4;
		new_item: ItemV4;
	}[];
	/**
	 * The Minecraft bedrock inventory system was refactored, but not all inventory actions use the new packet.
	 * This data structure holds actions that have not been updated to the new system.
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type TransactionLegacy = {
		/** LegacyRequestID is an ID that is only non-zero at times when sent by the client. The server should always send 0 for this. When this field is not 0, the LegacySetItemSlots slice below will have values in it. LegacyRequestID ties in with the ItemStackResponse packet. If this field is non-0, the server should respond with an ItemStackResponse packet. Some inventory actions such as dropping an item out of the hotbar are still one using this packet, and the ItemStackResponse packet needs to tie in with it. Versions: 1.16.210 – 1.26.60 */
		legacy_request_id: number;
		/** Versions: 1.16.210 – 1.26.60 */
		legacy_transactions?: {
			container_id: number;
			changed_slots: {
				slot_id: number;
			}[];
		}[] | undefined;
	};
	/**
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type Action = "start_break" | "abort_break" | "stop_break" | "get_updated_block" | "drop_item" | "start_sleeping" | "stop_sleeping" | "respawn" | "jump" | "start_sprint" | "stop_sprint" | "start_sneak" | "stop_sneak" | "creative_player_destroy_block" | "dimension_change_ack" | "start_glide" | "stop_glide" | "build_denied" | "crack_break" | "change_skin" | "set_enchatnment_seed" | "swimming" | "stop_swimming" | "start_spin_attack" | "stop_spin_attack" | "interact_block" | "predict_break" | "continue_break" | number | "start_item_use_on" | "stop_item_use_on" | "handled_teleport" | "missed_swing" | "start_crawling" | "stop_crawling" | "start_flying" | "stop_flying" | "received_server_data" | "start_using_item";
	/**
	 * ItemStackRequest is sent by the client to change item stacks in an inventory. It is essentially a
	 * replacement of the InventoryTransaction packet added in 1.16 for inventory specific actions, such as moving
	 * items around or crafting. The InventoryTransaction packet is still used for actions such as placing blocks
	 * and interacting with entities.
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type ItemStackRequest = {
		/** RequestID is a unique ID for the request. This ID is used by the server to send a response for this specific request in the ItemStackResponse packet. Versions: 1.16.210 – 1.26.60 */
		request_id: number;
		/** Versions: 1.16.210 – 1.26.60 */
		actions: {
			/** As of 1.26.40 the action type is an unsigned varint, the 'place in container' and 'take out container' entries are gone, and the type is repeated as a byte right after it. */
			type_id: "take" | "place" | "swap" | "drop" | "destroy" | "consume" | "create" | "lab_table_combine" | "beacon_payment" | "mine_block" | "craft_recipe" | "craft_recipe_auto" | "craft_creative" | "optional" | "non_implemented" | "results_deprecated" | number | "craft_grindstone_request" | "craft_loom_request" | "place_in_container" | "take_out_container" | "craft_reserved";
			count?: number | undefined;
			source?: StackRequestSlotInfo | undefined;
			destination?: StackRequestSlotInfo | undefined;
			randomly?: boolean | undefined;
			result_slot_id?: number | undefined;
			primary_effect?: number | undefined;
			secondary_effect?: number | undefined;
			hotbar_slot?: number | undefined;
			predicted_durability?: number | undefined;
			network_id?: number | undefined;
			recipe_network_id?: number | undefined;
			times_crafted?: number | undefined;
			item_id?: number | undefined;
			filtered_string_index?: number | undefined;
			result_items?: Item[] | ItemLegacy[] | ItemStackRequestInstanceDescriptor[] | undefined;
			cost?: number | undefined;
			pattern?: string | undefined;
			ingredients?: RecipeIngredient[] | RecipeIngredient2[] | undefined;
			times_crafted_2?: number | undefined;
			/** The action type again, as a byte. */
			legacy_type_id?: number | undefined;
			reserved_id?: string | undefined;
		}[];
		/** Versions: 1.16.210 – 1.26.60 */
		custom_names: string[];
		/** Versions: 1.19.30 – 1.26.60 */
		cause?: "chat_public" | "chat_whisper" | "sign_text" | "anvil_text" | "book_and_quill_text" | "command_block_text" | "block_actor_data_text" | "join_event_text" | "leave_event_text" | "slash_command_chat" | "cartography_text" | number | "slash_command_non_chat" | "scoreboard_text" | "ticking_area_text" | "kick_command" | "title_command" | "summon_command" | undefined;
	};
	/**
	 * Used in inventory transactions.
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type ContainerSlotType = "anvil_input" | "anvil_material" | "anvil_result" | "smithing_table_input" | "smithing_table_material" | "smithing_table_result" | "armor" | "container" | "beacon_payment" | "brewing_input" | "brewing_result" | "brewing_fuel" | "hotbar_and_inventory" | "crafting_input" | "crafting_output" | "recipe_construction" | "recipe_nature" | "recipe_items" | "recipe_search" | "recipe_search_bar" | "recipe_equipment" | "enchanting_input" | "enchanting_lapis" | "furnace_fuel" | "furnace_ingredient" | "furnace_output" | "horse_equip" | "hotbar" | "inventory" | "shulker" | "trade_ingredient1" | "trade_ingredient2" | "trade_result" | "offhand" | "compcreate_input" | "compcreate_output" | "elemconstruct_output" | "matreduce_input" | "matreduce_output" | "labtable_input" | "loom_input" | "loom_dye" | "loom_material" | "loom_result" | "blast_furnace_ingredient" | "smoker_ingredient" | "trade2_ingredient1" | "trade2_ingredient2" | "trade2_result" | "grindstone_input" | "grindstone_additional" | "grindstone_result" | "stonecutter_input" | "stonecutter_result" | "cartography_input" | "cartography_additional" | "cartography_result" | "barrel" | "cursor" | "creative_output" | number | "recipe_book" | "smithing_table_template" | "crafter" | "dynamic" | "registry" | "recipe_food" | "recipe_blocks" | "recipe_furnace_items" | "reserved_container_a" | "reserved_container_b" | "reserved_container_c" | "reserved_container_d";
	/**
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type UpdateBlockFlags = {
		/** Versions: 1.16.210 – 1.26.60 */
		_value: number;
		/** Versions: 1.16.210 – 1.26.60 */
		neighbors: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		network: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		no_graphic: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		unused: boolean;
		/** Versions: 1.16.210 – 1.26.60 */
		priority: boolean;
	};
	/**
	 * Versions: 1.16.210 – 1.26.10
	 */
	export type packet_debug_renderer = {
		/** Versions: 1.16.210 – 1.26.10 */
		type: "clear" | "add_cube" | number | string;
		/** Versions: 1.16.210 – 1.21.124 */
		text?: string | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		position?: vec3f | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		red?: number | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		green?: number | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		blue?: number | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		alpha?: number | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		duration?: Int64 | undefined;
		/** Versions: 1.21.130 – 1.26.10 */
		has_data?: boolean | undefined;
		/** Versions: 1.21.130 – 1.26.10 */
		data?: DebugMarkerData | undefined;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ShortArray = Buffer;
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ShortString = string;
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type BlockProperties = {
		name: string;
		state: NBT;
	}[];
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ItemExtraDataWithBlockingTick = {
		/** Versions: 1.16.220 – 1.26.60 */
		has_nbt: true | number;
		/** Versions: 1.16.220 – 1.26.60 */
		nbt?: {
			version: number;
			nbt: NBT;
		} | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		can_place_on: ShortString[];
		/** Versions: 1.16.220 – 1.26.60 */
		can_destroy: ShortString[];
		/** Versions: 1.16.220 – 1.26.60 */
		blocking_tick: Int64;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ItemExtraDataWithoutBlockingTick = {
		/** Versions: 1.16.220 – 1.26.60 */
		has_nbt: true | number;
		/** Versions: 1.16.220 – 1.26.60 */
		nbt?: {
			version: number;
			nbt: NBT;
		} | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		can_place_on: ShortString[];
		/** Versions: 1.16.220 – 1.26.60 */
		can_destroy: ShortString[];
	};
	/**
	 * Same as below but without a "networkStackID" boolean
	 * As of 1.26.40 an air item (network_id 0) no longer short-circuits: every field is always written, only
	 * the extra data blob ends up empty.
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ItemLegacy = {
		/** Versions: 1.16.220 – 1.26.60 */
		network_id: number;
		/** Versions: 1.16.220 – 1.26.60 */
		count?: number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		metadata?: number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		block_runtime_id?: number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		extra?: ItemExtraDataWithBlockingTick | ItemExtraDataWithoutBlockingTick | undefined;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type EnchantOption = {
		/** Versions: 1.16.220 – 1.26.60 */
		cost: number;
		/** Versions: 1.16.220 – 1.26.60 */
		slot_flags: number;
		/** Versions: 1.16.220 – 1.26.60 */
		equip_enchants: Enchant[];
		/** Versions: 1.16.220 – 1.26.60 */
		held_enchants: Enchant[];
		/** Versions: 1.16.220 – 1.26.60 */
		self_enchants: Enchant[];
		/** Versions: 1.16.220 – 1.26.60 */
		name: string;
		/** Versions: 1.16.220 – 1.26.60 */
		option_id: number;
	};
	/**
	 * MapTrackedObject is an object on a map that is 'tracked' by the client, such as an entity or a block. This
	 * object may move, which is handled client-side.
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type TrackedObject = {
		/** Type is the type of the tracked object. It is either MapObjectTypeEntity or MapObjectTypeBlock. Versions: 1.16.220 – 1.26.60 */
		type: "entity" | "block" | number;
		/** Versions: 1.16.220 – 1.26.60 */
		entity_unique_id?: bigint | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		block_position?: BlockCoordinates | undefined;
	};
	/**
	 * MapDecoration is a fixed decoration on a map: Its position or other properties do not change automatically
	 * client-side.
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type MapDecoration = {
		/** Versions: 1.16.220 – 1.26.60 */
		type: "marker_white" | "marker_green" | "marker_red" | "marker_blue" | "cross_white" | "triangle_red" | "square_white" | "marker_sign" | "marker_pink" | "marker_orange" | "marker_yellow" | "marker_teal" | "triangle_green" | "small_square_white" | "mansion" | "monument" | "no_draw" | "village_desert" | "village_plains" | "village_savanna" | "village_snowy" | "village_taiga" | "jungle_temple" | "witch_hut" | number | "witch_hut =>";
		/** Rotation is the rotation of the map decoration. It is byte due to the 16 fixed directions that the map decoration may face. Versions: 1.16.220 – 1.26.60 */
		rotation: number;
		/** X is the offset on the X axis in pixels of the decoration. Versions: 1.16.220 – 1.26.60 */
		x: number;
		/** Y is the offset on the Y axis in pixels of the decoration. Versions: 1.16.220 – 1.26.60 */
		y: number;
		/** Label is the name of the map decoration. This name may be of any value. Versions: 1.16.220 – 1.26.60 */
		label: string;
		/** Colour is the colour of the map decoration. Some map decoration types have a specific colour set automatically, whereas others may be changed. As of 1.26.40 this is a little endian int. Versions: 1.16.220 – 1.26.60 */
		color_abgr: number;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type StructureBlockSettings = {
		/** PaletteName is the name of the palette used in the structure. Currently, it seems that this field is always 'default'. Versions: 1.16.220 – 1.26.60 */
		palette_name: string;
		/** IgnoreEntities specifies if the structure should ignore entities or include them. If set to false, entities will also show up in the exported structure. Versions: 1.16.220 – 1.26.60 */
		ignore_entities: boolean;
		/** IgnoreBlocks specifies if the structure should ignore blocks or include them. If set to false, blocks will show up in the exported structure. Versions: 1.16.220 – 1.26.60 */
		ignore_blocks: boolean;
		/** Size is the size of the area that is about to be exported. The area exported will start at the Position + Offset, and will extend as far as Size specifies. Versions: 1.16.220 – 1.26.60 */
		size: BlockCoordinates;
		/** Offset is the offset position that was set in the structure block. The area exported is offset by this position. **TODO**: This will be renamed to offset soon Versions: 1.16.220 – 1.26.60 */
		structure_offset: BlockCoordinates;
		/** LastEditingPlayerUniqueID is the unique ID of the player that last edited the structure block that these settings concern. Versions: 1.16.220 – 1.26.60 */
		last_editing_player_unique_id: bigint;
		/** Rotation is the rotation that the structure block should obtain. See the constants above for available options. Versions: 1.16.220 – 1.26.60 */
		rotation: number | "none" | "90_deg" | "180_deg" | "270_deg";
		/** Mirror specifies the way the structure should be mirrored. It is either no mirror at all, mirror on the x/z axis or both. Versions: 1.16.220 – 1.26.60 */
		mirror: number | "none" | "x_axis" | "z_axis" | "both_axes";
		/** Integrity is usually 1, but may be set to a number between 0 and 1 to omit blocks randomly, using the Seed that follows. Versions: 1.16.220 – 1.26.60 */
		integrity: number;
		/** Seed is the seed used to omit blocks if Integrity is not equal to one. If the Seed is 0, a random seed is selected to omit blocks. Versions: 1.16.220 – 1.26.60 */
		seed: number;
		/** Pivot is the pivot around which the structure may be rotated. Versions: 1.16.220 – 1.26.60 */
		pivot: vec3f;
		/** Versions: 1.17.0 – 1.26.60 */
		animation_mode?: "none" | "layers" | "blocks" | number | undefined;
		/** How long the duration for this animation is Versions: 1.17.0 – 1.26.60 */
		animation_duration?: number | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		non_ticking_players_and_ticking_areas?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type WindowIDZigzag32 = "inventory" | "first" | "last" | "offhand" | "armor" | "creative" | "hotbar" | "fixed_inventory" | "ui" | "drop_contents" | "beacon" | "trading_output" | "trading_use_inputs" | "trading_input_2" | "trading_input_1" | "enchant_output" | "enchant_material" | "enchant_input" | "anvil_output" | "anvil_result" | "anvil_material" | "container_input" | "crafting_use_ingredient" | "crafting_result" | "crafting_remove_ingredient" | "crafting_add_ingredient" | "none" | number;
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type SoundType = "ItemUseOn" | "Hit" | "Step" | "Fly" | "Jump" | "Break" | "Place" | "HeavyStep" | "Gallop" | "Fall" | "Ambient" | "AmbientBaby" | "AmbientInWater" | "Breathe" | "Death" | "DeathInWater" | "DeathToZombie" | "Hurt" | "HurtInWater" | "Mad" | "Boost" | "Bow" | "SquishBig" | "SquishSmall" | "FallBig" | "FallSmall" | "Splash" | "Fizz" | "Flap" | "Swim" | "Drink" | "Eat" | "Takeoff" | "Shake" | "Plop" | "Land" | "Saddle" | "Armor" | "MobArmorStandPlace" | "AddChest" | "Throw" | "Attack" | "AttackNoDamage" | "AttackStrong" | "Warn" | "Shear" | "Milk" | "Thunder" | "Explode" | "Fire" | "Ignite" | "Fuse" | "Stare" | "Spawn" | "Shoot" | "BreakBlock" | "Launch" | "Blast" | "LargeBlast" | "Twinkle" | "Remedy" | "Infect" | "LevelUp" | "BowHit" | "BulletHit" | "ExtinguishFire" | "ItemFizz" | "ChestOpen" | "ChestClosed" | "ShulkerBoxOpen" | "ShulkerBoxClosed" | "EnderChestOpen" | "EnderChestClosed" | "PowerOn" | "PowerOff" | "Attach" | "Detach" | "Deny" | "Tripod" | "Pop" | "DropSlot" | "Note" | "Thorns" | "PistonIn" | "PistonOut" | "Portal" | "Water" | "LavaPop" | "Lava" | "Burp" | "BucketFillWater" | "BucketFillLava" | "BucketEmptyWater" | "BucketEmptyLava" | "ArmorEquipChain" | "ArmorEquipDiamond" | "ArmorEquipGeneric" | "ArmorEquipGold" | "ArmorEquipIron" | "ArmorEquipLeather" | "ArmorEquipElytra" | "Record13" | "RecordCat" | "RecordBlocks" | "RecordChirp" | "RecordFar" | "RecordMall" | "RecordMellohi" | "RecordStal" | "RecordStrad" | "RecordWard" | "Record11" | "RecordWait" | "unknown1" | "Flop" | "ElderGuardianCurse" | "MobWarning" | "MobWarningBaby" | "Teleport" | "ShulkerOpen" | "ShulkerClose" | "Haggle" | "HaggleYes" | "HaggleNo" | "HaggleIdle" | "ChorusGrow" | "ChorusDeath" | "Glass" | "PotionBrewed" | "CastSpell" | "PrepareAttack" | "PrepareSummon" | "PrepareWololo" | "Fang" | "Charge" | "CameraTakePicture" | "LeashKnotPlace" | "LeashKnotBreak" | "Growl" | "Whine" | "Pant" | "Purr" | "Purreow" | "DeathMinVolume" | "DeathMidVolume" | "unknown2" | "ImitateCaveSpider" | "ImitateCreeper" | "ImitateElderGuardian" | "ImitateEnderDragon" | "ImitateEnderman" | "unknown3" | "ImitateEvocationIllager" | "ImitateGhast" | "ImitateHusk" | "ImitateIllusionIllager" | "ImitateMagmaCube" | "ImitatePolarBear" | "ImitateShulker" | "ImitateSilverfish" | "ImitateSkeleton" | "ImitateSlime" | "ImitateSpider" | "ImitateStray" | "ImitateVex" | "ImitateVindicationIllager" | "ImitateWitch" | "ImitateWither" | "ImitateWitherSkeleton" | "ImitateWolf" | "ImitateZombie" | "ImitateZombiePigman" | "ImitateZombieVillager" | "BlockEndPortalFrameFill" | "BlockEndPortalSpawn" | "RandomAnvilUse" | "BottleDragonBreath" | "PortalTravel" | "ItemTridentHit" | "ItemTridentReturn" | "ItemTridentRiptide1" | "ItemTridentRiptide2" | "ItemTridentRiptide3" | "ItemTridentThrow" | "ItemTridentThunder" | "ItemTridentHitGround" | "Default" | "BlockFletchingTableUse" | "ElemConstructOpen" | "IceBombHit" | "BalloonPop" | "LtReactionIceBomb" | "LtReactionBleach" | "LtReactionEPaste" | "LtReactionEPaste2" | "LtReactionFertilizer" | "LtReactionFireball" | "LtReactionMgsalt" | "LtReactionMiscfire" | "LtReactionFire" | "LtReactionMiscexplosion" | "LtReactionMiscmystical" | "LtReactionMiscmystical2" | "LtReactionProduct" | "SparklerUse" | "GlowstickUse" | "SparklerActive" | "ConvertToDrowned" | "BucketFillFish" | "BucketEmptyFish" | "BubbleUp" | "BubbleDown" | "BubblePop" | "BubbleUpInside" | "BubbleDownInside" | "HurtBaby" | "DeathBaby" | "StepBaby" | "BabySpawn" | "Born" | "BlockTurtleEggBreak" | "BlockTurtleEggCrack" | "BlockTurtleEggHatch" | "TurtleLayEgg" | "BlockTurtleEggAttack" | "BeaconActivate" | "BeaconAmbient" | "BeaconDeactivate" | "BeaconPower" | "ConduitActivate" | "ConduitAmbient" | "ConduitAttack" | "ConduitDeactivate" | "ConduitShort" | "Swoop" | "BlockBambooSaplingPlace" | "PreSneeze" | "Sneeze" | "AmbientTame" | "Scared" | "BlockScaffoldingClimb" | "CrossbowLoadingStart" | "CrossbowLoadingMiddle" | "CrossbowLoadingEnd" | "CrossbowShoot" | "CrossbowQuickChargeStart" | "CrossbowQuickChargeMiddle" | "CrossbowQuickChargeEnd" | "AmbientAggressive" | "AmbientWorried" | "CantBreed" | "ItemShieldBlock" | "ItemBookPut" | "BlockGrindstoneUse" | "BlockBellHit" | "BlockCampfireCrackle" | "Roar" | "Stun" | "BlockSweetBerryBushHurt" | "BlockSweetBerryBushPick" | "UICartographyTableTakeResult" | "UIStoneCutterTakeResult" | "BlockComposterEmpty" | "BlockComposterFill" | "BlockComposterFillSuccess" | "BlockComposterReady" | "BlockBarrelOpen" | "BlockBarrelClose" | "RaidHorn" | "BlockLoomUse" | "AmbientRaid" | "UICartographyTableUse" | "UIStoneCutterUse" | "UILoomUse" | "SmokerUse" | "BlastFurnaceUse" | "SmithingTableUse" | "Screech" | "Sleep" | "FurnaceUse" | "MooshroomConvert" | "MilkSuspiciously" | "Celebrate" | "JumpPrevent" | "AmbientPollinate" | "BeeHiveDrip" | "BeeHiveEnter" | "BeeHiveExit" | "BeeHiveWork" | "BeeHiveShear" | "HoneyBottleDrink" | "AmbientCave" | "Retreat" | "ConvertToZombified" | "Admire" | "StepLava" | "Tempt" | "Panic" | "Angry" | "AmbientWarpedForest" | "AmbientSoulsandValley" | "AmbientNetherWastes" | "AmbientBasaltDeltas" | "AmbientCrimsonForest" | "RespawnAnchorCharge" | "RespawnAnchorDeplete" | "RespawnAnchorSetSpawn" | "RespawnAnchorAmbient" | "SoulEscapeQuiet" | "SoulEscapeLoud" | "RecordPigstep" | "LinkCompassToLodestone" | "BlockSmithingTableUse" | "EquipNetherite" | "AmbientLoopWarpedForest" | "AmbientLoopSoulsandValley" | "AmbientLoopNetherWastes" | "AmbientLoopBasaltDeltas" | "AmbientLoopCrimsonForest" | "AmbientAdditionWarpedForest" | "AmbientAdditionSoulsandValley" | "AmbientAdditionNetherWastes" | "AmbientAdditionBasaltDeltas" | "AmbientAdditionCrimsonForest" | "SculkSensorPowerOn" | "SculkSensorPowerOff" | "BucketFillPowderSnow" | "BucketEmptyPowderSnow" | "PointedDripstoneCauldronDripWater" | "PointedDripstoneCauldronDripLava" | "PointedDripstoneDripWater" | "PointedDripstoneDripLava" | "CaveVinesPickBerries" | "BigDripleafTiltDown" | "BigDripleafTiltUp" | "Undefined" | number | "unknown335" | "unknown336" | "unknown337" | "unknown338" | "copper_wax_on" | "copper_wax_off" | "scrape" | "player_hurt_drown" | "player_hurt_on_fire" | "player_hurt_freeze" | "use_spyglass" | "stop_using_spyglass" | "amethyst_block_chime" | "ambient_screamer" | "hurt_screamer" | "death_screamer" | "milk_screamer" | "jump_to_block" | "pre_ram" | "pre_ram_screamer" | "ram_impact" | "ram_impact_screamer" | "squid_ink_squirt" | "glow_squid_ink_squirt" | "convert_to_stray" | "extinguish_candle" | "ambient_candle" | "StopRecord" | "GuardianCurse" | "PrepareAttackSpell" | "AmbientGrowl" | "AmbientWhine" | "AmbientPant" | "AmbientPurr" | "AmbientPurreow" | "ImitateBlaze" | "ImitateEndermite" | "EnderEyePlaced" | "EndPortalCreated" | "AnvilUse" | "TridentHit" | "TridentReturn" | "TridentRiptide1" | "TridentRiptide2" | "TridentRiptide3" | "TridentThrow" | "TridentThunder" | "TridentHitGround" | "FletchingTableUse" | "LtReactionElephantToothpaste" | "LtReactionElephantToothpaste2" | "LtReactionGlowStick" | "LtReactionGlowStick2" | "LtReactionLuminol" | "LtReactionSalt" | "LtReactionMagnesiumSalt" | "LtReactionMiscFire" | "LtReactionMiscExplosion" | "LtReactionMiscMystical" | "LtReactionMiscMystical2" | "GlowStickUse" | "BubbleColumnUpwards" | "BubbleColumnDownwards" | "SpawnBaby" | "TurtleEggBreak" | "TurtleEggCrack" | "TurtleEggHatched" | "LayEgg" | "TurtleEggAttacked" | "BambooSaplingPlace" | "ScaffoldingClimb" | "ShieldBlock" | "LecternBookPlace" | "GrindstoneUse" | "Bell" | "CampfireCrackle" | "SweetBerryBushHurt" | "SweetBerryBushPick" | "CartographyTableUse" | "StonecutterUse" | "ComposterEmpty" | "ComposterFill" | "ComposterFillLayer" | "ComposterReady" | "BarrelOpen" | "BarrelClose" | "LoomUse" | "AmbientInRaid" | "UIStonecutterUse" | "BeehiveDrip" | "BeehiveEnter" | "BeehiveExit" | "BeehiveWork" | "BeehiveShear" | "HoneybottleDrink" | "AmbientMoodWarpedForest" | "AmbientMoodSoulsandValley" | "AmbientMoodNetherWastes" | "AmbientMoodBasaltDeltas" | "AmbientMoodCrimsonForest" | "UseSmithingTable" | "CopperWaxOn" | "CopperWaxOff" | "Scrape" | "PlayerHurtDrown" | "PlayerHurtOnFire" | "PlayerHurtFreeze" | "UseSpyglass" | "StopUsingSpyglass" | "AmethystBlockChime" | "AmbientScreamer" | "HurtScreamer" | "DeathScreamer" | "MilkScreamer" | "JumpToBlock" | "PreRam" | "PreRamScreamer" | "RamImpact" | "RamImpactScreamer" | "SquidInkSquirt" | "GlowSquidInkSquirt" | "ConvertToStray" | "CakeAddCandle" | "ExtinguishCandle" | "AmbientCandle" | "BlockClick" | "BlockClickFail" | "SculkCatalystBloom" | "SculkShriekerShriek" | "WardenNearbyClose" | "WardenNearbyCloser" | "WardenNearbyClosest" | "WardenSlightlyAngry" | "RecordOtherside" | "Tongue" | "CrackIronGolem" | "RepairIronGolem" | "UicartographyTableUse" | "UistonecutterUse" | "UiloomUse" | "Listening" | "Heartbeat" | "HornBreak" | "SculkPlace" | "SculkSpread" | "SculkCharge" | "SculkSensorPlace" | "SculkShriekerPlace" | "goat_call_0" | "goat_call_1" | "goat_call_2" | "goat_call_3" | "goat_call_4" | "goat_call_5" | "goat_call_6" | "goat_call_7" | "goat_call_8" | "goat_call_9" | "goat_harmony_0" | "goat_harmony_1" | "goat_harmony_2" | "goat_harmony_3" | "goat_harmony_4" | "goat_harmony_5" | "goat_harmony_6" | "goat_harmony_7" | "goat_harmony_8" | "goat_harmony_9" | "goat_melody_0" | "goat_melody_1" | "goat_melody_2" | "goat_melody_3" | "goat_melody_4" | "goat_melody_5" | "goat_melody_6" | "goat_melody_7" | "goat_melody_8" | "goat_melody_9" | "goat_bass_0" | "goat_bass_1" | "goat_bass_2" | "goat_bass_3" | "goat_bass_4" | "goat_bass_5" | "goat_bass_6" | "goat_bass_7" | "goat_bass_8" | "goat_bass_9" | "_" | "ImitateWarden" | "ListeningAngry" | "ItemGiven" | "ItemTaken" | "Disappeared" | "Reappeared" | "FrogspawnHatched" | "LaySpawn" | "FrogspawnBreak" | "SonicBoom" | "SonicCharge" | "SoundeventItemThrown" | "Record5" | "ConvertToFrog" | "DrinkMilk" | "RecordPlaying" | "EnchantingTableUse" | "BundleDropContents" | "BundleInsert" | "BundleRemoveOne" | "StepSand" | "DashReady" | "PressurePlateClickOff" | "PressurePlateClickOn" | "ButtonClickOff" | "ButtonClickOn" | "DoorOpen" | "DoorClose" | "TrapdoorOpen" | "TrapdoorClose" | "FenceGateOpen" | "FenceGateClose" | "Insert" | "Pickup" | "InsertEnchanted" | "PickupEnchanted" | "Brush" | "BrushCompleted" | "ShatterDecoratedPot" | "BreakDecoratedPot" | "SnifferEggCrack" | "SnifferEggHatched" | "WaxedSignInteractFail" | "RecordRelic" | "Bump" | "PumpkinCarve" | "ConvertHuskToZombie" | "PigDeath" | "HoglinZombified" | "AmbientUnderwaterEnter" | "AmbientUnderwaterExit" | "bottle_fill" | "bottle_empty" | "crafter_craft" | "crafter_fail" | "block_decorated_pot_insert" | "block_decorated_pot_insert_fail" | "crafter_disable_slot" | "block_copper_bulb_turn_on" | "block_copper_bulb_turn_off" | "trial_spawner_open_shutter" | "trial_spawner_eject_item" | "trial_spawner_detect_player" | "trial_spawner_spawn_mob" | "trial_spawner_close_shutter" | "trial_spawner_ambient" | "ambient_in_air" | "breeze_wind_charge_burst" | "imitate_breeze" | "mob_armadillo_brush" | "mob_armadillo_scute_drop" | "armor_equip_wolf" | "armor_unequip_wolf" | "reflect" | "vault_open_shutter" | "vault_close_shutter" | "vault_eject_item" | "vault_insert_item" | "vault_insert_item_fail" | "vault_ambient" | "vault_activate" | "vault_deactivate" | "hurt_reduced" | "wind_charge_burst" | "armor_crack_wolf" | "armor_break_wolf" | "armor_repair_wolf" | "mace_smash_air" | "mace_smash_ground" | "trail_spawner_charge_activate" | "trail_spawner_ambient_ominous" | "ominous_item_spawner_spawn_item" | "ominous_bottle_end_use" | "mace_smash_heavy_ground" | "ominous_item_spawner_spawn_item_begin" | "apply_effect_bad_omen" | "apply_effect_raid_omen" | "apply_effect_trial_omen" | "ominous_item_spawner_about_to_spawn_item" | "record_creator" | "record_creator_music_box" | "record_precipice" | "imitate_drowned" | "bundle_insert_failed" | "imitate_creaking" | "sponge_absorb" | "block_creaking_heart_trail" | "creaking_heart_spawn" | "activate" | "deactivate" | "freeze" | "unfreeze" | "open" | "open_long" | "close" | "close_long" | "imitate_phantom" | "imitate_zoglin" | "imitate_guardian" | "imitate_ravager" | "imitate_pillager" | "place_in_water" | "state_change" | "imitate_happy_ghast" | "unique_generic" | "record_tears" | "the_end_light_flash" | "lead_leash" | "lead_unleash" | "lead_break" | "unsaddle" | "equip_copper" | "ArmorStandPlace" | "Unfect" | "GoatCall0" | "GoatCall1" | "GoatCall2" | "GoatCall3" | "GoatCall4" | "GoatCall5" | "GoatCall6" | "GoatCall7" | "GoatCall8" | "GoatCall9" | "GoatHarmony0" | "GoatHarmony1" | "GoatHarmony2" | "GoatHarmony3" | "GoatHarmony4" | "GoatHarmony5" | "GoatHarmony6" | "GoatHarmony7" | "GoatHarmony8" | "GoatHarmony9" | "GoatMelody0" | "GoatMelody1" | "GoatMelody2" | "GoatMelody3" | "GoatMelody4" | "GoatMelody5" | "GoatMelody6" | "GoatMelody7" | "GoatMelody8" | "GoatMelody9" | "GoatBass0" | "GoatBass1" | "GoatBass2" | "GoatBass3" | "GoatBass4" | "GoatBass5" | "GoatBass6" | "GoatBass7" | "GoatBass8" | "GoatBass9" | "BottleFill" | "BottleEmpty" | "CrafterCraft" | "CrafterFail" | "DecoratedPotInsert" | "DecoratedPotInsertFail" | "CrafterDisableSlot" | "TrialSpawnerOpenShutter" | "TrialSpawnerEjectItem" | "TrialSpawnerDetectPlayer" | "TrialSpawnerSpawnMob" | "TrialSpawnerCloseShutter" | "TrialSpawnerAmbient" | "CopperBulbTurnOn" | "CopperBulbTurnOff" | "AmbientInAir" | "BreezeWindChargeBurst" | "ImitateBreeze" | "ArmadilloBrush" | "ArmadilloScuteDrop" | "EquipWolf" | "UnequipWolf" | "Reflect" | "VaultOpenShutter" | "VaultCloseShutter" | "VaultEjectItem" | "VaultInsertItem" | "VaultInsertItemFail" | "VaultAmbient" | "VaultActivate" | "VaultDeactive" | "HurtReduced" | "WindChargeBurst" | "ImitateBogged" | "WolfArmourCrack" | "WolfArmourBreak" | "WolfArmourRepair" | "MaceSmashAir" | "MaceSmashGround" | "TrialSpawnerChargeActivate" | "TrialSpawnerAmbientOminous" | "OminiousItemSpawnerSpawnItem" | "OminousBottleEndUse" | "MaceHeavySmashGround" | "OminousItemSpawnerSpawnItemBegin" | "ApplyEffectBadOmen" | "ApplyEffectRaidOmen" | "ApplyEffectTrialOmen" | "OminousItemSpawnerAboutToSpawnItem" | "RecordCreator" | "RecordCreatorMusicBox" | "RecordPrecipice" | "VaultRejectRewardedPlayer" | "ImitateDrowned" | "ImitateCreaking" | "BundleInsertFailed" | "SpongeAbsorb" | "BlockCreakingHeartTrail" | "CreakingHeartSpawn" | "Activate" | "Deactivate" | "Freeze" | "Unfreeze" | "Open" | "OpenLong" | "Close" | "CloseLong" | "ImitatePhantom" | "ImitateZoglin" | "ImitateGuardian" | "ImitateRavager" | "ImitatePillager" | "PlaceInWater" | "StateChange" | "ImitateHappyGhast" | "UniqueGeneric" | "RecordTears" | "TheEndLightFlash" | "LeadLeash" | "LeadUnleash" | "LeadBreak" | "Unsaddle" | "EquipCopper" | "RecordLavaChicken" | "PlaceItem" | "SingleItemSwap" | "MultiItemSwap" | "ItemEnchantLunge1" | "ItemEnchantLunge2" | "ItemEnchantLunge3" | "AttackCritical" | "ItemSpearAttackHit" | "ItemSpearAttackMiss" | "ItemWoodenSpearAttackHit" | "ItemWoodenSpearAttackMiss" | "ImitateParched" | "ImitateCamelHusk" | "ItemSpearUse" | "ItemWoodenSpearUse" | "SaddleInWater" | "ItemStoneSpearAttackHit" | "ItemIronSpearAttackHit" | "ItemCopperSpearAttackHit" | "ItemGoldenSpearAttackHit" | "ItemDiamondSpearAttackHit" | "ItemNetheriteSpearAttackHit" | "ItemStoneSpearAttackMiss" | "ItemIronSpearAttackMiss" | "ItemCopperSpearAttackMiss" | "ItemGoldenSpearAttackMiss" | "ItemDiamondSpearAttackMiss" | "ItemNetheriteSpearAttackMiss" | "ItemStoneSpearUse" | "ItemIronSpearUse" | "ItemCopperSpearUse" | "ItemGoldenSpearUse" | "ItemDiamondSpearUse" | "ItemNetheriteSpearUse" | "PauseGrowth" | "ResetGrowth" | "PushedByPlayer" | "Bounce" | "SlimeLanding" | "AbsorbBlock" | "EjectBlock" | "GeyserEruptionStart" | "GeyserEruptionActive" | "RecordBounce" | "BucketFillLandAnimal" | "BucketEmptyLandAnimal" | "GeyserContinuousEruptionStart" | "GeyserContinuousEruptionActive" | "Mount" | "Dismount" | "StrawBedBreakLeave";
	/**
	 * Versions: 1.16.220 – 1.26.30
	 */
	export type UpdateMapFlags = {
		/** Versions: 1.16.220 – 1.26.30 */
		_value: number;
		/** Versions: 1.16.220 – 1.26.30 */
		void: boolean;
		/** Versions: 1.16.220 – 1.26.30 */
		texture: boolean;
		/** Versions: 1.16.220 – 1.26.30 */
		decoration: boolean;
		/** Versions: 1.16.220 – 1.26.30 */
		initialisation: boolean;
	};
	/**
	 * Sent by the server to synchronize/update entity properties as NBT, an alternative to Set Entity Data.
	 * Versions: 1.17.0 – 1.26.60
	 */
	export type packet_sync_entity_property = {
		/** Versions: 1.17.0 – 1.26.60 */
		nbt: NBT;
	};
	/**
	 * AddVolumeEntity sends a volume entity's definition and components from server to client.
	 * Versions: 1.17.0 – 1.26.60
	 */
	export type packet_add_volume_entity = {
		/** Versions: 1.17.0 – 1.18.0 */
		entity_id?: bigint | undefined;
		/** EntityMetadata is a map of entity metadata, which includes flags and data properties that alter in particular the way the entity looks. Versions: 1.17.0 – 1.26.60 */
		nbt: NBT;
		/** Versions: 1.17.30 – 1.26.60 */
		engine_version?: string | undefined;
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.18.11 – 1.26.60 */
		runtime_id?: bigint | undefined;
		/** Versions: 1.18.11 */
		json_identifier?: string | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		instance_name?: string | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		encoding_identifier?: string | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		bounds?: {
			min: BlockCoordinates;
			max: BlockCoordinates;
		} | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		dimension?: number | undefined;
	};
	/**
	 * RemoveVolumeEntity indicates a volume entity to be removed from server to client.
	 * Versions: 1.17.0 – 1.26.60
	 */
	export type packet_remove_volume_entity = {
		/** The Runtime Entity ID Versions: 1.17.0 – 1.26.60 */
		entity_id: bigint;
	};
	/**
	 * SimulationType is an in-progress packet. We currently do not know the use case.
	 * Versions: 1.17.10 – 1.26.60
	 */
	export type packet_simulation_type = {
		/** SimulationType is the simulation type selected Versions: 1.17.10 – 1.26.60 */
		type: "game" | "editor" | "test" | "invalid" | number;
	};
	/**
	 * NPCDialogue is a packet that allows the client to display dialog boxes for interacting with NPCs.
	 * Versions: 1.17.10 – 1.26.60
	 */
	export type packet_npc_dialogue = {
		/** ActorUniqueID is the ID of the NPC being requested. Versions: 1.17.10 – 1.26.60 */
		entity_id: Int64;
		/** ActionType is the type of action for the packet. Versions: 1.17.10 – 1.26.60 */
		action_type: "open" | "close" | number;
		/** Dialogue is the text that the client should see. Versions: 1.17.10 – 1.26.60 */
		dialogue: string;
		/** SceneName is the scene the data was pulled from for the client. Versions: 1.17.10 – 1.26.60 */
		screen_name: string;
		/** NPCName is the name of the NPC to be displayed to the client. Versions: 1.17.10 – 1.26.60 */
		npc_name: string;
		/** ActionJSON is the JSON string of the buttons/actions the server can perform. Versions: 1.17.10 – 1.26.60 */
		action_json: string;
	};
	/**
	 * EducationSharedResourceURI is an education edition feature that is used for transmitting
	 * education resource settings to clients. It contains a button name and a link URL.
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type EducationSharedResourceURI = {
		/** ButtonName is the button name of the resource URI. Versions: 1.17.30 – 1.26.60 */
		button_name: string;
		/** LinkURI is the link URI for the resource URI. Versions: 1.17.30 – 1.26.60 */
		link_uri: string;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type EducationExternalLinkSettings = {
		/** URL is the external link URL. Versions: 1.17.30 – 1.26.60 */
		url: string;
		/** DisplayName is the display name in game. Versions: 1.17.30 – 1.26.60 */
		display_name: string;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type BlockUpdate = {
		/** Versions: 1.17.30 – 1.26.60 */
		position: BlockCoordinates;
		/** Versions: 1.17.30 – 1.26.60 */
		runtime_id: number;
		/** Versions: 1.17.30 – 1.26.60 */
		flags: number;
		/** EntityUniqueID is the unique ID of the falling block entity that the block transitions to or that the entity transitions from. Note that for both possible values for TransitionType, the EntityUniqueID should point to the falling block entity involved. Versions: 1.17.30 – 1.26.60 */
		entity_unique_id: bigint;
		/** TransitionType is the type of the transition that happened. It is either BlockToEntityTransition, when a block placed becomes a falling entity, or EntityToBlockTransition, when a falling entity hits the ground and becomes a solid block again. Versions: 1.17.30 – 1.26.60 */
		transition_type: "entity" | "create" | "destroy" | number;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type MaterialReducer = {
		/** Versions: 1.17.30 – 1.26.60 */
		mix: number;
		/** Versions: 1.17.30 – 1.26.60 */
		items: {
			network_id: number;
			count: number;
		};
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type packet_edu_uri_resource_packet = {
		/** Versions: 1.17.30 – 1.26.60 */
		resource: EducationSharedResourceURI;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type packet_create_photo = {
		/** Versions: 1.17.30 – 1.26.60 */
		entity_unique_id: Int64;
		/** Versions: 1.17.30 – 1.26.60 */
		photo_name: string;
		/** Versions: 1.17.30 – 1.26.60 */
		item_name: string;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type packet_update_subchunk_blocks = {
		/** Versions: 1.17.30 – 1.26.60 */
		x: number;
		/** Versions: 1.17.30 – 1.26.60 */
		y: number;
		/** Versions: 1.17.30 – 1.26.60 */
		z: number;
		/** Versions: 1.17.30 – 1.26.60 */
		blocks: BlockUpdate[];
		/** Versions: 1.17.30 – 1.26.60 */
		extra: BlockUpdate[];
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type packet_photo_info_request = {
		/** Versions: 1.17.30 – 1.26.60 */
		photo_id: bigint;
	};
	/**
	 * Versions: 1.17.40 – 1.26.60
	 */
	export type packet_subchunk = {
		/** Versions: 1.17.40 – 1.26.60 */
		dimension: number;
		/** Versions: 1.17.40 – 1.18.0 */
		x?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		y?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		z?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		data?: ByteArray | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		request_result?: "undefined" | "success" | "chunk_not_found" | "invalid_dimension" | "player_not_found" | "y_index_out_of_bounds" | number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		heightmap_type?: "no_data" | "has_data" | "too_high" | "too_low" | number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		heightmap?: Buffer | undefined;
		/** Versions: 1.18.0 – 1.26.60 */
		cache_enabled?: boolean | undefined;
		/** Versions: 1.18.0 */
		blob_id?: Int64 | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		origin?: vec3i | vec3li | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		entries?: SubChunkEntryWithCaching | SubChunkEntryWithoutCaching | SubChunkEntry | undefined;
	};
	/**
	 * Versions: 1.17.40 – 1.26.60
	 */
	export type packet_subchunk_request = {
		/** Versions: 1.17.40 – 1.26.60 */
		dimension: number;
		/** Versions: 1.17.40 – 1.18.0 */
		x?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		y?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		z?: number | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		origin?: vec3i | vec3li | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		requests?: {
			dx: number;
			dy: number;
			dz: number;
		}[] | vec3i8[] | undefined;
	};
	/**
	 * Versions: 1.18.11 – 1.26.60
	 */
	export type DeviceOS = "Undefined" | "Android" | "IOS" | "OSX" | "FireOS" | "GearVR" | "Hololens" | "Win10" | "Win32" | "Dedicated" | "TVOS" | "Orbis" | "NintendoSwitch" | "Xbox" | "WindowsPhone" | number | "Linux";
	/**
	 * Versions: 1.18.11 – 1.26.30
	 */
	export type SubChunkEntryWithoutCaching = {
		dx: number;
		dy: number;
		dz: number;
		result: "undefined" | "success" | "chunk_not_found" | "invalid_dimension" | "player_not_found" | "y_index_out_of_bounds" | "success_all_air" | number;
		payload: ByteArray;
		heightmap_type: "no_data" | "has_data" | "too_high" | "too_low" | number | HeightMapDataType;
		heightmap?: Buffer | undefined;
		render_heightmap_type?: HeightMapDataType | undefined;
		render_heightmap?: Buffer | undefined;
	}[];
	/**
	 * Versions: 1.18.11 – 1.26.30
	 */
	export type SubChunkEntryWithCaching = {
		dx: number;
		dy: number;
		dz: number;
		result: "undefined" | "success" | "chunk_not_found" | "invalid_dimension" | "player_not_found" | "y_index_out_of_bounds" | "success_all_air" | number;
		payload?: ByteArray | undefined;
		heightmap_type: "no_data" | "has_data" | "too_high" | "too_low" | number | HeightMapDataType;
		heightmap?: Buffer | undefined;
		blob_id: Int64;
		render_heightmap_type?: HeightMapDataType | undefined;
		render_heightmap?: Buffer | undefined;
	}[];
	/**
	 * Versions: 1.18.11 – 1.26.60
	 */
	export type packet_client_start_item_cooldown = {
		/** Versions: 1.18.11 – 1.26.60 */
		category: string;
		/** Versions: 1.18.11 – 1.26.60 */
		duration: number;
	};
	/**
	 * Versions: 1.18.11 – 1.26.60
	 */
	export type packet_script_message = {
		/** Versions: 1.18.11 – 1.26.60 */
		message_id: string;
		/** Versions: 1.18.11 – 1.26.60 */
		data: string;
	};
	/**
	 * Versions: 1.18.11 – 1.26.60
	 */
	export type packet_code_builder_source = {
		/** Versions: 1.18.11 – 1.26.60 */
		operation: "none" | "get" | "set" | "reset" | number;
		/** Versions: 1.18.11 – 1.26.60 */
		category: "none" | "code_status" | "instantiation" | number;
		/** Versions: 1.18.11 – 1.20.80 */
		value?: string | undefined;
		/** Versions: 1.21.0 – 1.26.60 */
		code_status?: "none" | "not_started" | "in_progress" | "paused" | "error" | "succeeded" | number | undefined;
	};
	/**
	 * TickingAreasLoadStatus is sent by the server to the client to notify the client of a ticking area's loading status.
	 * Versions: 1.18.30 – 1.26.60
	 */
	export type packet_ticking_areas_load_status = {
		/** Preload is true if the server is waiting for the area's preload. Versions: 1.18.30 – 1.26.60 */
		preload: boolean;
	};
	/**
	 * DimensionData is a packet sent from the server to the client containing information about data-driven dimensions
	 * that the server may have registered. This packet does not seem to be sent by default, rather only being sent when
	 * any data-driven dimensions are registered.
	 * Versions: 1.18.30 – 1.26.60
	 */
	export type packet_dimension_data = {
		/** Versions: 1.18.30 – 1.26.60 */
		definitions: {
			id: string;
			max_height?: number | undefined;
			min_height?: number | undefined;
			generator: "legacy" | "overworld" | "flat" | "nether" | "end" | "void" | number;
			dimension_type?: number | undefined;
			pack_id?: string | undefined;
			min_y?: number | undefined;
			height_range?: number | undefined;
			default_biome?: string | undefined;
			cloud_height?: number | undefined;
			render_clouds?: boolean | undefined;
		}[];
	};
	/**
	 * AgentAction is an Education Edition packet sent from the server to the client to return a response to a
	 * previously requested action.
	 * Versions: 1.18.30 – 1.26.60
	 */
	export type packet_agent_action = {
		/** Versions: 1.18.30 – 1.26.60 */
		request_id: string;
		/** Versions: 1.18.30 – 1.26.60 */
		action_type: "none" | "attack" | "collect" | "destroy" | "detect_redstone" | "detect_obstacle" | "drop" | "drop_all" | "inspect" | "inspect_data" | "inspect_item_count" | "inspect_item_detail" | "inspect_item_space" | "interact" | "move" | "place_block" | "till" | "transfer_item_to" | "turn" | number;
		/** Versions: 1.18.30 – 1.26.60 */
		body: string;
	};
	/**
	 * ChangeMobProperty is a packet sent from the server to the client to change one of the properties of a mob client-side.
	 * Versions: 1.18.30 – 1.26.60
	 */
	export type packet_change_mob_property = {
		/** EntityUniqueID is the unique ID of the entity whose property is being changed. Versions: 1.18.30 – 1.26.60 */
		entity_unique_id: bigint;
		/** Property is the name of the property being updated. Versions: 1.18.30 – 1.26.60 */
		property: string;
		/** BoolValue is set if the property value is a bool type. If the type is not a bool, this field is ignored. Versions: 1.18.30 – 1.26.60 */
		bool_value: boolean;
		/** StringValue is set if the property value is a string type. If the type is not a string, this field is ignored. Versions: 1.18.30 – 1.26.60 */
		string_value: string;
		/** IntValue is set if the property value is an int type. If the type is not an int, this field is ignored. Versions: 1.18.30 – 1.26.60 */
		int_value: number;
		/** FloatValue is set if the property value is a float type. If the type is not a float, this field is ignored. Versions: 1.18.30 – 1.26.60 */
		float_value: number;
	};
	/**
	 * # Permissions
	 * The permission level of a player, for example whether they are an Server Operator or not.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type PermissionLevel = "visitor" | "member" | "operator" | "custom" | number;
	/**
	 * LessonProgress is a packet sent by the server to the client to inform the client of updated progress on a lesson.
	 * This packet only functions on the Minecraft: Education Edition version of the game.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type packet_lesson_progress = {
		/** Action is the action the client should perform to show progress. This is one of the constants defined above. Versions: 1.19.1 – 1.26.60 */
		action: number;
		/** Score is the score the client should use when displaying the progress. Versions: 1.19.1 – 1.26.60 */
		score: number;
		/** Identifier is the identifier of the lesson that is being progressed. Versions: 1.19.1 – 1.26.60 */
		identifier: string;
	};
	/**
	 * RequestAbility is a packet sent by the client to the server to request permission for a specific ability from the
	 * server.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type packet_request_ability = {
		/** Ability is the ability that the client is requesting. This is one of the constants defined above. Versions: 1.19.1 – 1.26.60 */
		ability: "build" | "mine" | "doors_and_switches" | "open_containers" | "attack_players" | "attack_mobs" | "operator_commands" | "teleport" | "invulnerable" | "flying" | "may_fly" | "instant_build" | "lightning" | "fly_speed" | "walk_speed" | "muted" | "world_builder" | "no_clip" | "ability_count" | number;
		/** Value type decides which of the fields you should read/write from Versions: 1.19.1 – 1.26.60 */
		value_type: "bool" | "float" | number;
		/** If value type is bool, use this value Versions: 1.19.1 – 1.26.60 */
		bool_value: boolean;
		/** If value type is float, use this value Versions: 1.19.1 – 1.26.60 */
		float_val: number;
	};
	/**
	 * RequestPermissions is a packet sent from the client to the server to request permissions that the client does not
	 * currently have. It can only be sent by operators and host in vanilla Minecraft.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type packet_request_permissions = {
		/** EntityUniqueID is the unique ID of the player. The unique ID is unique for the entire world and is often used in packets. Most servers send an EntityUniqueID equal to the EntityRuntimeID. Versions: 1.19.1 – 1.26.60 */
		entity_unique_id: Int64;
		/** PermissionLevel is the current permission level of the player. Same as constants in AdventureSettings packet. Versions: 1.19.1 – 1.26.60 */
		permission_level: PermissionLevel;
		/** RequestedPermissions contains the requested permission flags. Versions: 1.19.1 – 1.26.60 */
		requested_permissions: RequestPermissions;
	};
	/**
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type RequestPermissions = {
		/** Versions: 1.19.1 – 1.26.60 */
		_value: number;
		/** Versions: 1.19.1 – 1.26.60 */
		build: boolean;
		/** Versions: 1.19.1 – 1.26.60 */
		mine: boolean;
		/** Versions: 1.19.1 – 1.26.60 */
		doors_and_switches: boolean;
		/** Versions: 1.19.1 – 1.26.60 */
		open_containers: boolean;
		/** Versions: 1.19.1 – 1.26.60 */
		attack_players: boolean;
		/** Versions: 1.19.1 – 1.26.60 */
		attack_mobs: boolean;
		/** Versions: 1.19.1 – 1.26.60 */
		operator: boolean;
		/** Versions: 1.19.1 – 1.26.60 */
		teleport: boolean;
	};
	/**
	 * ToastRequest is a packet sent from the server to the client to display a toast to the top of the screen. These toasts
	 * are the same as the ones seen when, for example, loading a new resource pack or obtaining an achievement.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type packet_toast_request = {
		/** Title is the title of the toast. Versions: 1.19.1 – 1.26.60 */
		title: string;
		/** Message is the message that the toast may contain alongside the title. Versions: 1.19.1 – 1.26.60 */
		message: string;
	};
	/**
	 * The command permission level, for example if being run by a Player, an Op, or a Command Block.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type CommandPermissionLevel = "normal" | "operator" | "automation" | "host" | "owner" | "internal" | number;
	/**
	 * The command permission level, for example if being run by a Player, an Op, or a Command Block.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type CommandPermissionLevelVarint = "normal" | "operator" | "automation" | "host" | "owner" | "internal" | number;
	/**
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type AbilitySet = {
		/** Versions: 1.19.10 – 1.26.60 */
		_value: number;
		/** Versions: 1.19.10 – 1.26.60 */
		build: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		mine: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		doors_and_switches: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		open_containers: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		attack_players: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		attack_mobs: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		operator_commands: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		teleport: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		invulnerable: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		flying: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		may_fly: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		instant_build: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		lightning: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		fly_speed: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		walk_speed: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		muted: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		world_builder: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		no_clip: boolean;
		/** Versions: 1.19.10 – 1.26.60 */
		count: boolean;
		/** Versions: 1.19.70 – 1.26.60 */
		privileged_builder?: boolean | undefined;
		/** Versions: 1.21.60 – 1.26.60 */
		vertical_fly_speed?: boolean | undefined;
	};
	/**
	 * AbilityLayer represents the abilities of a specific layer, such as the base layer or the spectator layer.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type AbilityLayers = {
		/** Type represents the type of the layer. This is one of the AbilityLayerType constants defined above. Versions: 1.19.10 – 1.26.60 */
		type: "cache" | "base" | "spectator" | "commands" | number | "editor" | "loading_screen";
		/** The abilities that can be toggled between Versions: 1.19.10 – 1.26.60 */
		allowed: AbilitySet;
		/** The abilities that are currently active Versions: 1.19.10 – 1.26.60 */
		enabled: AbilitySet;
		/** FlySpeed is the default horizontal fly speed of the layer. Versions: 1.19.10 – 1.26.60 */
		fly_speed: number;
		/** WalkSpeed is the default walk speed of the layer. Versions: 1.19.10 – 1.26.60 */
		walk_speed: number;
		/** VerticalFlySpeed is the default vertical fly speed of the layer. Versions: 1.21.60 – 1.26.60 */
		vertical_fly_speed?: number | undefined;
	};
	/**
	 * UpdateAbilities is a packet sent from the server to the client to update the abilities of the player. It, along with
	 * the UpdateAdventureSettings packet, are replacements of the AdventureSettings packet since v1.19.10.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type packet_update_abilities = {
		/** EntityUniqueID is the unique ID of the player. The unique ID is a value that remains consistent across different sessions of the same world, but most servers simply fill the runtime ID of the entity out for this field. Versions: 1.19.10 – 1.26.60 */
		entity_unique_id: Int64;
		/** PlayerPermissions is the permission level of the player. It is a value from 0-3, with 0 being visitor, 1 being member, 2 being operator and 3 being custom. Versions: 1.19.10 – 1.26.60 */
		permission_level: PermissionLevel;
		/** CommandPermissions is a permission level that specifies the kind of commands that the player is allowed to use. It is one of the CommandPermissionLevel constants in the AdventureSettings packet. Versions: 1.19.10 – 1.26.60 */
		command_permission: CommandPermissionLevel;
		/** Layers contains all ability layers and their potential values. This should at least have one entry, being the base layer. Versions: 1.19.10 – 1.26.60 */
		abilities: AbilityLayers[];
	};
	/**
	 * UpdateAdventureSettings is a packet sent from the server to the client to update the adventure settings of the player.
	 * It, along with the UpdateAbilities packet, are replacements of the AdventureSettings packet since v1.19.10.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type packet_update_adventure_settings = {
		/** NoPvM is a boolean indicating whether the player is allowed to fight mobs or not. Versions: 1.19.10 – 1.26.60 */
		no_pvm: boolean;
		/** NoMvP is a boolean indicating whether mobs are allowed to fight the player or not. It is unclear why this is sent to the client. Versions: 1.19.10 – 1.26.60 */
		no_mvp: boolean;
		/** ImmutableWorld is a boolean indicating whether the player is allowed to modify the world or not. Versions: 1.19.10 – 1.26.60 */
		immutable_world: boolean;
		/** ShowNameTags is a boolean indicating whether player name tags are shown or not. Versions: 1.19.10 – 1.26.60 */
		show_name_tags: boolean;
		/** AutoJump is a boolean indicating whether the player is allowed to jump automatically or not. Versions: 1.19.10 – 1.26.60 */
		auto_jump: boolean;
	};
	/**
	 * DeathInfo is a packet sent from the server to the client expected to be sent when a player dies. It contains messages
	 * related to the player's death, which are shown on the death screen as of v1.19.10.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type packet_death_info = {
		/** Cause is the cause of the player's death, such as "suffocation" or "suicide". Versions: 1.19.10 – 1.26.60 */
		cause: string;
		/** Messages is a list of death messages to be shown on the death screen. Versions: 1.19.10 – 1.26.60 */
		messages: string[];
	};
	/**
	 * EditorNetwork is a packet sent from the server to the client and vise-versa to communicate editor-mode related
	 * information. It carries a single compound tag containing the relevant information.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type packet_editor_network = {
		/** Payload is a network little endian compound tag holding data relevant to the editor. Versions: 1.19.10 – 1.26.60 */
		payload: NBT;
		/** Versions: 1.21.20 – 1.26.60 */
		route_to_manager?: boolean | undefined;
	};
	/**
	 * FeatureRegistry is a packet used to notify the client about the world generation features the server is currently
	 * using. This is used in combination with the client-side world generation system introduced in v1.19.20, allowing the
	 * client to completely generate the chunks of the world without having to rely on the server.
	 * Versions: 1.19.20 – 1.26.60
	 */
	export type packet_feature_registry = {
		/** Features is a slice of all registered world generation features. Versions: 1.19.20 – 1.26.60 */
		features: {
			name: string;
			options: string;
		}[];
	};
	/**
	 * ServerStats is a packet sent from the server to the client to update the client on server statistics. It is purely
	 * used for telemetry.
	 * Versions: 1.19.30 – 1.26.60
	 */
	export type packet_server_stats = {
		/** Versions: 1.19.30 – 1.26.60 */
		server_time: number;
		/** Versions: 1.19.30 – 1.26.60 */
		network_time: number;
	};
	/**
	 * Versions: 1.19.30 – 1.26.60
	 */
	export type packet_request_network_settings = {
		/** Versions: 1.19.30 – 1.26.60 */
		client_protocol: number;
	};
	/**
	 * Versions: 1.19.30 – 1.26.60
	 */
	export type packet_game_test_request = {
		/** MaxTestsPerBatch ... Versions: 1.19.30 – 1.26.60 */
		max_tests_per_batch: number;
		/** Repetitions represents the amount of times the test will be run. Versions: 1.19.30 – 1.26.60 */
		repetitions: number;
		/** Rotation represents the rotation of the test. It is one of the constants above. Versions: 1.19.30 – 1.26.60 */
		rotation: "0deg" | "90deg" | "180deg" | "270deg" | "360deg" | number;
		/** Versions: 1.19.30 – 1.26.60 */
		stop_on_error: boolean;
		/** Versions: 1.19.30 – 1.26.60 */
		position: BlockCoordinates;
		/** Versions: 1.19.30 – 1.26.60 */
		tests_per_row: number;
		/** Versions: 1.19.30 – 1.26.60 */
		name: string;
	};
	/**
	 * Versions: 1.19.30 – 1.26.60
	 */
	export type packet_game_test_results = {
		/** Versions: 1.19.30 – 1.26.60 */
		succeeded: boolean;
		/** Versions: 1.19.30 – 1.26.60 */
		error: string;
		/** Versions: 1.19.30 – 1.26.60 */
		name: string;
	};
	/**
	 * Versions: 1.19.40 – 1.26.60
	 */
	export type EntityProperties = {
		/** Versions: 1.19.40 – 1.26.60 */
		ints: {
			index: number;
			value: number;
		}[];
		/** Versions: 1.19.40 – 1.26.60 */
		floats: {
			index: number;
			value: number;
		}[];
	};
	/**
	 * Versions: 1.19.50 – 1.26.60
	 */
	export type InputLockFlags = {
		/** Versions: 1.19.50 – 1.26.60 */
		_value: number;
		/** Versions: 1.19.50 – 1.26.60 */
		move: boolean;
		/** Versions: 1.19.50 – 1.26.60 */
		jump: boolean;
		/** Versions: 1.19.50 – 1.26.60 */
		sneak: boolean;
		/** Versions: 1.19.50 – 1.26.60 */
		mount: boolean;
		/** Versions: 1.19.50 – 1.26.60 */
		dismount: boolean;
		/** Versions: 1.19.50 – 1.26.60 */
		rotation: boolean;
	};
	/**
	 * Versions: 1.19.50 – 1.26.60
	 */
	export type packet_update_client_input_locks = {
		/** Versions: 1.19.50 – 1.26.60 */
		locks: InputLockFlags;
		/** Versions: 1.19.50 – 1.26.0 */
		position?: vec3f | undefined;
	};
	/**
	 * Versions: 1.19.60 – 1.26.60
	 */
	export type packet_client_cheat_ability = {
		/** Versions: 1.19.60 – 1.26.60 */
		entity_unique_id: Int64;
		/** Versions: 1.19.60 – 1.26.60 */
		permission_level: PermissionLevel;
		/** Versions: 1.19.60 – 1.26.60 */
		command_permission: CommandPermissionLevel;
		/** Versions: 1.19.60 – 1.26.60 */
		abilities: AbilityLayers[];
	};
	/**
	 * Versions: 1.19.70 – 1.26.60
	 */
	export type packet_camera_presets = {
		/** Versions: 1.19.70 – 1.20.10 */
		data?: NBT | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		presets?: CameraPresets[] | undefined;
	};
	/**
	 * Versions: 1.19.70 – 1.26.60
	 */
	export type packet_unlocked_recipes = {
		/** Versions: 1.19.70 – 1.19.80 */
		new_unlocks?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		recipes: string[];
		/** Versions: 1.20.0 – 1.26.60 */
		unlock_type?: "empty" | "initially_unlocked" | "newly_unlocked" | "remove_unlocked" | "remove_all_unlocked" | number | undefined;
	};
	/**
	 * Versions: 1.19.70 – 1.26.60
	 */
	export type packet_camera_instruction = {
		/** Versions: 1.19.70 – 1.20.10 */
		data?: NBT | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		instruction_set?: {
			runtime_id: number;
			ease_data?: {
				type: "Linear" | "Spring" | "InQuad" | "OutQuad" | "InOutQuad" | "InCubic" | "OutCubic" | "InOutCubic" | "InQuart" | "OutQuart" | "InOutQuart" | "InQuint" | "OutQuint" | "InOutQuint" | "InSine" | "OutSine" | "InOutSine" | "InExpo" | "OutExpo" | "InOutExpo" | "InCirc" | "OutCirc" | "InOutCirc" | "InBounce" | "OutBounce" | "InOutBounce" | "InBack" | "OutBack" | "InOutBack" | "InElastic" | "OutElastic" | "InOutElastic" | number | EaseType;
				duration: number;
			} | undefined;
			position?: vec3f | undefined;
			rotation?: vec2f | undefined;
			facing?: vec3f | undefined;
			default?: boolean | undefined;
			offset?: vec2f | undefined;
			entity_offset?: vec3f | undefined;
			remove_ignore_starting_values?: boolean | undefined;
		} | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		clear?: boolean | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		fade?: {
			fade_in_duration: number;
			wait_duration: number;
			fade_out_duration: number;
			color_rgb: vec3f;
		} | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		target?: {
			offset?: vec3f | undefined;
			entity_unique_id: Int64;
		} | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		remove_target?: boolean | undefined;
		/** Versions: 1.21.100 – 1.26.60 */
		fov?: {
			field_of_view: number;
			ease_time: number;
			ease_type: EaseType;
			clear: boolean;
		} | undefined;
		/** Versions: 1.21.120 – 1.26.60 */
		spline?: CameraSplineInstruction | undefined;
		/** Versions: 1.21.120 – 1.26.60 */
		attach_to_entity?: Int64 | undefined;
		/** Versions: 1.21.120 – 1.26.60 */
		detach_from_entity?: boolean | undefined;
	};
	/**
	 * Versions: 1.19.80 – 1.26.60
	 */
	export type packet_compressed_biome_definitions = {
		/** Versions: 1.19.80 – 1.26.60 */
		raw_payload: string | ByteArray;
	};
	/**
	 * Versions: 1.19.80 – 1.26.60
	 */
	export type packet_trim_data = {
		/** Versions: 1.19.80 – 1.26.60 */
		patterns: {
			item_name: string;
			pattern: string;
		}[];
		/** Versions: 1.19.80 – 1.26.60 */
		materials: {
			material: string;
			color: string;
			item_name: string;
		}[];
	};
	/**
	 * Versions: 1.19.80 – 1.26.60
	 */
	export type packet_open_sign = {
		/** Versions: 1.19.80 – 1.26.60 */
		position: BlockCoordinates;
		/** Versions: 1.19.80 – 1.26.60 */
		is_front: boolean;
	};
	/**
	 * agent_animation is an Education Edition packet sent from the server to the client to make an agent perform an animation.
	 * Versions: 1.20.10 – 1.26.60
	 */
	export type packet_agent_animation = {
		/** animation is the ID of the animation that the agent should perform. As of its implementation, there are no IDs that can be used in the regular client. Versions: 1.20.10 – 1.26.60 */
		animation: "arm_swing" | "shrug" | number;
		/** entity_runtime_id is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.20.10 – 1.26.60 */
		entity_runtime_id: bigint;
	};
	/**
	 * Versions: 1.20.30 – 1.26.60
	 */
	export type Vec3fopts = {
		/** Versions: 1.20.30 – 1.26.60 */
		x?: number | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		y?: number | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		z?: number | undefined;
	};
	/**
	 * Versions: 1.20.30 – 1.26.60
	 */
	export type Vec2fopts = {
		/** Versions: 1.20.30 – 1.26.60 */
		x?: number | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		y?: number | undefined;
	};
	/**
	 * Versions: 1.20.30 – 1.26.60
	 */
	export type CameraPresets = {
		/** Name is the name of the preset. Each preset must have their own unique name. Versions: 1.20.30 – 1.26.60 */
		name: string;
		/** Parent is the name of the preset that this preset extends upon. This can be left empty. Versions: 1.20.30 – 1.26.60 */
		parent: string;
		/** Versions: 1.20.30 – 1.26.60 */
		position: Vec3fopts;
		/** Versions: 1.20.30 – 1.26.60 */
		rotation: Vec2fopts;
		/** Versions: 1.20.30 – 1.26.60 */
		audio_listener?: number | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		player_effects?: boolean | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		offset?: vec2f | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		radius?: number | undefined;
		/** Versions: 1.21.30 – 1.26.60 */
		rotation_speed?: number | undefined;
		/** Versions: 1.21.30 – 1.26.60 */
		snap_to_target?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.60 */
		entity_offset?: vec3f | undefined;
		/** Versions: 1.21.42 – 1.26.60 */
		horizontal_rotation_limit?: vec2f | undefined;
		/** Versions: 1.21.42 – 1.26.60 */
		vertical_rotation_limit?: vec2f | undefined;
		/** Versions: 1.21.42 – 1.26.60 */
		continue_targeting?: boolean | undefined;
		/** Versions: 1.21.42 – 1.21.80 */
		align_target_and_camera_forward?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.60 */
		tracking_radius?: number | undefined;
		/** Versions: 1.21.50 – 1.26.60 */
		aim_assist?: {
			preset_id?: string | undefined;
			target_mode?: "angle" | "distance" | number | undefined;
			angle?: vec2f | undefined;
			distance?: number | undefined;
		} | undefined;
		/** Versions: 1.21.60 – 1.26.60 */
		yaw_limit_min?: number | undefined;
		/** Versions: 1.21.60 – 1.26.60 */
		yaw_limit_max?: number | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		control_scheme?: "locked_player_relative_strafe" | "camera_relative" | "camera_relative_strafe" | "player_relative" | "player_relative_strafe" | number | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		apply_inherited_starting_rotation?: boolean | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		starting_rotation?: vec2f | undefined;
	};
	/**
	 * RefreshEntitlements is sent by the client to the server to refresh the entitlements of the player.
	 * Versions: 1.20.30 – 1.26.60
	 */
	export type packet_refresh_entitlements = Record<string, never>;
	/**
	 * Versions: 1.20.40 – 1.26.60
	 */
	export type DisconnectFailReason = "unknown" | "cant_connect_no_internet" | "no_permissions" | "unrecoverable_error" | "third_party_blocked" | "third_party_no_internet" | "third_party_bad_ip" | "third_party_no_server_or_server_locked" | "version_mismatch" | "skin_issue" | "invite_session_not_found" | "edu_level_settings_missing" | "local_server_not_found" | "legacy_disconnect" | "user_leave_game_attempted" | "platform_locked_skins_error" | "realms_world_unassigned" | "realms_server_cant_connect" | "realms_server_hidden" | "realms_server_disabled_beta" | "realms_server_disabled" | "cross_platform_disallowed" | "cant_connect" | "session_not_found" | "client_settings_incompatible_with_server" | "server_full" | "invalid_platform_skin" | "edition_version_mismatch" | "edition_mismatch" | "level_newer_than_exe_version" | "no_fail_occurred" | "banned_skin" | "timeout" | "server_not_found" | "outdated_server" | "outdated_client" | "no_premium_platform" | "multiplayer_disabled" | "no_wifi" | "world_corruption" | "no_reason" | "disconnected" | "invalid_player" | "logged_in_other_location" | "server_id_conflict" | "not_allowed" | "not_authenticated" | "invalid_tenant" | "unknown_packet" | "unexpected_packet" | "invalid_command_request_packet" | "host_suspended" | "login_packet_no_request" | "login_packet_no_cert" | "missing_client" | "kicked" | "kicked_for_exploit" | "kicked_for_idle" | "resource_pack_problem" | "incompatible_pack" | "out_of_storage" | "invalid_level" | "disconnect_packet_deprecated" | "block_mismatch" | "invalid_heights" | "invalid_widths" | "connection_lost" | "zombie_connection" | "shutdown" | "reason_not_set" | "loading_state_timeout" | "resource_pack_loading_failed" | "searching_for_session_loading_screen_failed" | "conn_protocol_version" | "subsystem_status_error" | "empty_auth_from_discovery" | "empty_url_from_discovery" | "expired_auth_from_discovery" | "unknown_signal_service_sign_in_failure" | "xbl_join_lobby_failure" | "unspecified_client_instance_disconnection" | "conn_session_not_found" | "conn_create_peer_connection" | "conn_ice" | "conn_connect_request" | "conn_connect_response" | "conn_negotiation_timeout" | "conn_inactivity_timeout" | "stale_connection_being_replaced" | "realms_session_not_found" | "bad_packet" | number | "conn_failed_to_create_offer" | "conn_failed_to_create_answer" | "conn_failed_to_set_local_description" | "conn_failed_to_set_remote_description" | "conn_negotiation_timeout_waiting_for_response" | "conn_negotiation_timeout_waiting_for_accept" | "conn_incoming_connection_ignored" | "conn_signaling_parsing_failure" | "conn_signaling_unknown_error" | "conn_signaling_unicast_delivery_failed" | "conn_signaling_broadcast_delivery_failed" | "conn_signaling_generic_delivery_failed" | "editor_mismatch_editor_world" | "editor_mismatch_vanilla_world" | "world_transfer_not_primary_client" | "server_shutdown" | "game_setup_cancelled" | "game_setup_failed" | "no_venue" | "conn_signalling_sign_in_failed" | "session_access_denied" | "service_sign_in_issue" | "conn_no_signaling_channel" | "conn_not_logged_in" | "conn_client_signalling_error" | "sub_client_login_disabled" | "deep_link_trying_to_open_demo_world_while_signed_in" | "async_join_task_denied" | "realms_timeline_required" | "guest_withough_host" | "failed_to_join_experience" | "host_signed_out" | "script_watchdog_exception" | "script_memory_limit_exceeded" | "storage_low_during_gameplay" | "storage_full_during_gameplay" | "level_storage_corruption" | "edition_mismatch_vanilla_to_edu" | "edition_mismatch_edu_to_vanilla" | "editor_mismatch_editor_to_vanilla" | "editor_mismatch_vanilla_to_editor" | "deny_listed" | "nonce_missing" | "nonce_not_found" | "nonce_expired" | "nonce_not_valid" | "nethernet_data_channel_closed" | "discovery_environment_mismatch" | "host_without_keys" | "host_disconnected" | "editor_join_intent_policy_failure" | "nethernet_identity_not_allowed" | "invalid_name" | "expired_token" | "host_accepts_no_type_of_auth" | "not_authenticated_fast_fail" | "editor_not_allowed" | "missing_structure_data" | "unsupported_transport" | "sub_client_login_not_bound";
	/**
	 * Versions: 1.20.50 – 1.26.60
	 */
	export type vec3li = {
		/** Versions: 1.20.50 – 1.26.60 */
		x: number;
		/** Versions: 1.20.50 – 1.26.60 */
		y: number;
		/** Versions: 1.20.50 – 1.26.60 */
		z: number;
	};
	/**
	 * Versions: 1.20.50 – 1.26.60
	 */
	export type packet_toggle_crafter_slot_request = {
		/** Versions: 1.20.50 – 1.26.60 */
		position: vec3li;
		/** Versions: 1.20.50 – 1.26.60 */
		slot: number;
		/** Versions: 1.20.50 – 1.26.60 */
		disabled: boolean;
	};
	/**
	 * Versions: 1.20.50 – 1.26.60
	 */
	export type packet_set_player_inventory_options = {
		/** Versions: 1.20.50 – 1.26.60 */
		left_tab: "none" | "construction" | "equipment" | "items" | "nature" | "search" | "survival" | number;
		/** Versions: 1.20.50 – 1.26.60 */
		right_tab: "none" | "fullscreen" | "crafting" | "armor" | number;
		/** Versions: 1.20.50 – 1.26.60 */
		filtering: boolean;
		/** Versions: 1.20.50 – 1.26.60 */
		layout: "none" | "survival" | "recipe_book" | "creative" | number | "inventory_only" | "default" | "recipe_book_only";
		/** Versions: 1.20.50 – 1.26.60 */
		crafting_layout: "none" | "survival" | "recipe_book" | "creative" | number | "inventory_only" | "default" | "recipe_book_only";
	};
	/**
	 * Versions: 1.20.50 – 1.26.60
	 */
	export type packet_server_post_move = {
		/** Versions: 1.20.50 – 1.26.60 */
		position: vec3f;
	};
	/**
	 * SetHud is sent by the server to set the visibility of individual HUD elements on the client. It is
	 * important to note that the client does not reset the state of the HUD elements after it leaves a server,
	 * meaning they can leak into sessions on different servers. To be safe, you should reset the visibility of
	 * all HUD elements when a player connects.
	 * Versions: 1.20.61 – 1.26.60
	 */
	export type packet_set_hud = {
		/** Elements is a list of HUD elements that are being modified. The values can be any of the HudElement constants above. Versions: 1.20.61 – 1.26.60 */
		elements: Element[];
		/** Visibility represents the new visibility of the specified Elements. It can be any of the HudVisibility constants above. Versions: 1.20.61 – 1.26.60 */
		visibility: "hide" | "reset" | number;
	};
	/**
	 * Versions: 1.20.61 – 1.26.60
	 */
	export type Element = "PaperDoll" | "Armour" | "ToolTips" | "TouchControls" | "Crosshair" | "HotBar" | "Health" | "ProgressBar" | "Hunger" | "AirBubbles" | "HourseHealth" | number | "VehicleHealth" | "EffectsBar" | "ItemTextPopup";
	/**
	 * As of 1.26.40 the context is a zigzag32 and the ingredient list is written as an optional (present only
	 * when the context is 'none') rather than being inferred from the context alone.
	 * Versions: 1.21.0 – 1.26.60
	 */
	export type RecipeUnlockingRequirement = {
		/** Versions: 1.21.0 – 1.26.60 */
		context: "none" | "always_unlocked" | "player_in_water" | "player_has_many_items" | number;
		/** Versions: 1.21.0 – 1.26.60 */
		ingredients?: RecipeIngredient[] | undefined;
	};
	/**
	 * Versions: 1.21.0 – 1.26.60
	 */
	export type packet_award_achievement = {
		/** Versions: 1.21.0 – 1.26.60 */
		achievement_id: number;
	};
	/**
	 * clientbound_close_form is sent by the server to clear the entire form stack of the client. This means that all
	 * forms that are currently open will be closed. This does not affect inventories and other containers.
	 * Versions: 1.21.2 – 1.26.60
	 */
	export type packet_clientbound_close_form = Record<string, never>;
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type FullContainerName = {
		/** Versions: 1.21.20 – 1.26.60 */
		container_id: ContainerSlotType;
		/** Versions: 1.21.20 – 1.26.60 */
		dynamic_container_id?: number | undefined;
	};
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type packet_serverbound_loading_screen = {
		/** Versions: 1.21.20 – 1.26.60 */
		type: number;
		/** Versions: 1.21.20 – 1.26.60 */
		loading_screen_id?: number | undefined;
	};
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type packet_jigsaw_structure_data = {
		/** Versions: 1.21.20 – 1.26.60 */
		structure_data: NBT;
	};
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type packet_current_structure_feature = {
		/** Versions: 1.21.20 – 1.26.60 */
		current_feature: string;
	};
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type packet_serverbound_diagnostics = {
		/** Versions: 1.21.20 – 1.26.60 */
		average_frames_per_second: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_server_sim_tick_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_client_sim_tick_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_begin_frame_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_input_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_render_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_end_frame_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_remainder_time_percent: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_unaccounted_time_percent: number;
		/** Versions: 1.26.0 – 1.26.60 */
		memory_category_values?: MemoryCategoryCounter[] | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		entity_diagnostics?: EntityDiagnosticTimingInfo[] | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		system_diagnostics?: SystemDiagnosticTimingInfo[] | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		whisker_scopes?: WhiskerScopeDataSummary[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		system_categories?: SystemCategory[] | undefined;
	};
	/**
	 * Versions: 1.21.30 – 1.26.60
	 */
	export type packet_camera_aim_assist = {
		/** Versions: 1.21.30 – 1.26.60 */
		view_angle: vec2f;
		/** Versions: 1.21.30 – 1.26.60 */
		distance: number;
		/** Versions: 1.21.30 – 1.26.60 */
		target_mode: number | "angle" | "distance";
		/** Versions: 1.21.30 – 1.26.60 */
		action: number | "set" | "clear";
		/** Versions: 1.21.50 – 1.26.60 */
		preset_id?: string | undefined;
		/** Versions: 1.21.100 – 1.26.60 */
		show_debug_render?: boolean | undefined;
	};
	/**
	 * Versions: 1.21.30 – 1.26.60
	 */
	export type packet_container_registry_cleanup = {
		/** Versions: 1.21.30 – 1.26.60 */
		removed_containers: FullContainerName[];
	};
	/**
	 * Versions: 1.21.42 – 1.26.60
	 */
	export type MovementEffectType = "GLIDE_BOOST" | "invalid" | number | "GEYSER_BOOST";
	/**
	 * Versions: 1.21.42 – 1.26.60
	 */
	export type packet_movement_effect = {
		/** Versions: 1.21.42 – 1.26.60 */
		runtime_id: bigint;
		/** Versions: 1.21.42 – 1.26.60 */
		effect_type: MovementEffectType;
		/** Versions: 1.21.42 – 1.26.60 */
		effect_duration: number;
		/** Versions: 1.21.42 – 1.26.60 */
		tick: bigint;
	};
	/**
	 * Versions: 1.21.42 – 1.26.60
	 */
	export type packet_set_movement_authority = {
		/** Versions: 1.21.42 – 1.26.60 */
		movement_authority: "client" | "server" | "server_with_rewind" | number;
	};
	/**
	 * CameraAimAssistPresets is sent by the server to the client to provide a list of categories and presets
	 * that can be used when sending a CameraAimAssist packet or a CameraInstruction including aim assist.
	 * Versions: 1.21.50 – 1.26.60
	 */
	export type packet_camera_aim_assist_presets = {
		/** CategoryGroups is a list of groups of categories which can be referenced by one of the Presets. Versions: 1.21.50 – 1.26.60 */
		categories: {
			/** Identifier is the unique identifier of the group. */
			name: string;
			/** Priorities represents the block and entity specific priorities for targetting. The aim assist will select the block or entity with the highest priority within the specified thresholds. */
			entity_priorities: {
				id: string;
				priority: number;
			}[];
			block_priorities: {
				id: string;
				priority: number;
			}[];
			entity_default?: number | undefined;
			block_default?: number | undefined;
			block_tags?: number[] | undefined;
			entity_type_families?: {
				id: string;
				priority: number;
			}[] | undefined;
		}[];
		/** Versions: 1.21.50 – 1.26.60 */
		presets: {
			id: string;
			exclude_blocks?: string[] | undefined;
			target_liquids: string[];
			item_settings: {
				/** Identifier of the item to apply the settings to. */
				id: string;
				/** Category is the identifier of a category to use which has been defined by a CameraAimAssistCategory. */
				category: string;
			}[];
			default_item_settings?: string | undefined;
			hand_settings?: string | undefined;
			exclusion_settings?: {
				blocks: string[];
				entities: string[];
				block_tags: string[];
				entity_type_families?: string[] | undefined;
			} | undefined;
		}[];
		/** Versions: 1.21.60 – 1.26.60 */
		operation?: "set" | "add_to_existing" | number | undefined;
	};
	/**
	 * ItemRegistryPacket is used to declare what items the server makes available, and components of custom items.
	 * After 1.21.60, this packet replaces the functionality of the "itemstates" field in the StartGamePacket
	 * In pre-1.21.60 versions, this was the ItemComponentPacket, and was
	 * sent by the server to attach client-side components to custom items.
	 * Versions: 1.21.60 – 1.26.60
	 */
	export type packet_item_registry = {
		/** `items` holds a list of all items. Versions: 1.21.60 – 1.26.60 */
		itemstates: Itemstates;
	};
	/**
	 * Versions: 1.21.60 – 1.26.60
	 */
	export type packet_client_camera_aim_assist = {
		/** !bound: client Versions: 1.21.60 – 1.26.60 */
		preset_id: string;
		/** Versions: 1.21.60 – 1.26.60 */
		action: "set_from_camera_preset" | "clear" | number;
		/** Versions: 1.21.60 – 1.26.60 */
		allow_aim_assist: boolean;
	};
	/**
	 * Versions: 1.21.60 – 1.26.60
	 */
	export type packet_client_movement_prediction_sync = {
		/** !bound: ? Versions: 1.21.60 – 1.26.60 */
		data_flags: bigint;
		/** Versions: 1.21.60 – 1.26.60 */
		bounding_box: {
			scale: number;
			width: number;
			height: number;
		};
		/** Versions: 1.21.60 – 1.26.60 */
		movement_speed: number;
		/** Versions: 1.21.60 – 1.26.60 */
		underwater_movement_speed: number;
		/** Versions: 1.21.60 – 1.26.60 */
		lava_movement_speed: number;
		/** Versions: 1.21.60 – 1.26.60 */
		jump_strength: number;
		/** Versions: 1.21.60 – 1.26.60 */
		health: number;
		/** Versions: 1.21.60 – 1.26.60 */
		hunger: number;
		/** Versions: 1.21.60 – 1.26.60 */
		entity_runtime_id: bigint;
		/** Versions: 1.21.70 – 1.26.60 */
		is_flying?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		unknown_attribute_1?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		unknown_attribute_2?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		unknown_attribute_3?: number | undefined;
	};
	/**
	 * Versions: 1.21.70 – 1.26.60
	 */
	export type packet_update_client_options = {
		/** Versions: 1.21.70 – 1.26.60 */
		graphics_mode?: "simple" | "fancy" | "advanced" | "ray_traced" | number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		filter_profanity?: boolean | undefined;
	};
	/**
	 * PlayerVideoCapturePacket is sent by the server to start or stop video recording for a player. This packet
	 * only works on development builds and has no effect on retail builds. When recording, the client will save
	 * individual frames to '/LocalCache/minecraftpe' in the format specified below.
	 * Versions: 1.21.70 – 1.26.60
	 */
	export type packet_player_video_capture = {
		/** action is the action that the client should perform. This is one of the constants defined above. Versions: 1.21.70 – 1.26.60 */
		action: "stop" | "start" | number;
		/** Versions: 1.21.70 – 1.26.60 */
		frame_rate?: number | undefined;
		/** Versions: 1.21.70 – 1.26.60 */
		file_prefix?: string | undefined;
	};
	/**
	 * PlayerUpdateEntityOverrides is sent by the server to modify an entity's properties individually.
	 * Versions: 1.21.70 – 1.26.60
	 */
	export type packet_player_update_entity_overrides = {
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.21.70 – 1.26.60 */
		runtime_id: bigint;
		/** PropertyIndex is the index of the property to modify. The index is unique for each property of an entity. Versions: 1.21.70 – 1.26.60 */
		property_index: number;
		/** Type is the type of action to perform with the property. It is one of the constants above. As of 1.26.40 it is sent twice: once as an unsigned varint and once as the legacy byte. Versions: 1.21.70 – 1.26.60 */
		type: "clear_all" | "remove" | "set_int" | "set_float" | number;
		/** Versions: 1.21.70 – 1.26.60 */
		value?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		legacy_type?: number | undefined;
	};
	/**
	 * BiomeDefinition represents a biome definition in the game. This can be a vanilla biome or a completely
	 * custom biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeDefinition = {
		/** NameIndex represents the index of the biome name in the string list from BiomeDefinitionListPacket. Versions: 1.21.80 – 1.26.60 */
		name_index: number;
		/** BiomeID is the biome ID. This is optional and can be empty. Versions: 1.21.80 – 1.26.60 */
		biome_id?: number | undefined;
		/** Temperature is the temperature of the biome, used for weather, biome behaviours and sky colour. Versions: 1.21.80 – 1.26.60 */
		temperature: number;
		/** Downfall is the amount that precipitation affects colours and block changes. Versions: 1.21.80 – 1.26.60 */
		downfall: number;
		/** Versions: 1.21.80 – 1.21.100 */
		red_spore_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		blue_spore_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		ash_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		white_ash_density?: number | undefined;
		/** Depth ... Versions: 1.21.80 – 1.26.60 */
		depth: number;
		/** Scale ... Versions: 1.21.80 – 1.26.60 */
		scale: number;
		/** MapWaterColour is an ARGB value for the water colour on maps in the biome. Versions: 1.21.80 – 1.26.60 */
		map_water_colour: number;
		/** Rain is true if the biome has rain, false if it is a dry biome. Versions: 1.21.80 – 1.26.60 */
		rain: boolean;
		/** Versions: 1.21.80 – 1.26.60 */
		tags?: number[] | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		chunk_generation?: BiomeChunkGeneration | undefined;
		/** Changes leaves turning white in snow Versions: 1.21.111 – 1.26.60 */
		snow_foliage?: number | undefined;
	};
	/**
	 * BiomeChunkGeneration represents the information required for the client to generate chunks itself
	 * to create the illusion of a larger render distance.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeChunkGeneration = {
		/** Versions: 1.21.80 – 1.26.60 */
		climate?: BiomeClimate | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		consolidated_features?: BiomeConsolidatedFeature[] | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		mountain_parameters?: BiomeMountainParameters | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		surface_material_adjustments?: BiomeElementData[] | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		surface_materials?: BiomeSurfaceMaterial | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		has_swamp_surface?: boolean | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		has_frozen_ocean_surface?: boolean | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		has_end_surface?: boolean | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		mesa_surface?: BiomeMesaSurface | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		capped_surface?: BiomeCappedSurface | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		overworld_rules?: BiomeOverworldRules | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		multi_noise_rules?: BiomeMultiNoiseRules | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		legacy_rules?: BiomeConditionalTransformation[] | undefined;
		/** Versions: 1.21.111 – 1.26.10 */
		has_default_overworld_surface?: boolean | undefined;
		/** Versions: 1.21.120 – 1.26.60 */
		replacements_data?: BiomeReplacementData[] | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		has_village_type?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		village_type?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		surface_builder_data?: BiomeSurfaceBuilder | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		sub_surface_builder_data?: BiomeSurfaceBuilder | undefined;
	};
	/**
	 * BiomeClimate represents the climate of a biome, mainly for ambience but also defines certain behaviours.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeClimate = {
		/** Temperature is the temperature of the biome, used for weather, biome behaviours and sky colour. Versions: 1.21.80 – 1.26.60 */
		temperature: number;
		/** Downfall is the amount that precipitation affects colours and block changes. Versions: 1.21.80 – 1.26.60 */
		downfall: number;
		/** Versions: 1.21.80 – 1.21.100 */
		red_spore_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		blue_spore_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		ash_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		white_ash_density?: number | undefined;
		/** SnowAccumulationMin is the minimum amount of snow that can accumulate in the biome, every 0.125 is another layer of snow. Versions: 1.21.80 – 1.26.60 */
		snow_accumulation_min: number;
		/** SnowAccumulationMax is the maximum amount of snow that can accumulate in the biome, every 0.125 is another layer of snow. Versions: 1.21.80 – 1.26.60 */
		snow_accumulation_max: number;
	};
	/**
	 * BiomeMountainParameters specifies the parameters for a mountain biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeMountainParameters = {
		/** SteepBlock is the runtime ID of the block to use for steep slopes. Versions: 1.21.80 – 1.26.60 */
		steep_block: number;
		/** NorthSlopes is true if the biome has north slopes. Versions: 1.21.80 – 1.26.60 */
		north_slopes: boolean;
		/** SouthSlopes is true if the biome has south slopes. Versions: 1.21.80 – 1.26.60 */
		south_slopes: boolean;
		/** WestSlopes is true if the biome has west slopes. Versions: 1.21.80 – 1.26.60 */
		west_slopes: boolean;
		/** EastSlopes is true if the biome has east slopes. Versions: 1.21.80 – 1.26.60 */
		east_slopes: boolean;
		/** TopSlideEnabled is true if the biome has top slide enabled. Versions: 1.21.80 – 1.26.60 */
		top_slide_enabled: boolean;
	};
	/**
	 * BiomeSurfaceMaterial specifies the materials to use for the surface layers of the biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeSurfaceMaterial = {
		/** TopBlock is the runtime ID of the block to use for the top layer. Versions: 1.21.80 – 1.26.60 */
		top_block: number;
		/** MidBlock is the runtime ID to use for the middle layers. Versions: 1.21.80 – 1.26.60 */
		mid_block: number;
		/** SeaFloorBlock is the runtime ID to use for the sea floor. Versions: 1.21.80 – 1.26.60 */
		sea_floor_block: number;
		/** FoundationBlock is the runtime ID to use for the foundation layers. Versions: 1.21.80 – 1.26.60 */
		foundation_block: number;
		/** SeaBlock is the runtime ID to use for the sea layers. Versions: 1.21.80 – 1.26.60 */
		sea_block: number;
		/** SeaFloorDepth is the depth of the sea floor, in blocks. Versions: 1.21.80 – 1.26.60 */
		sea_floor_depth: number;
	};
	/**
	 * BiomeMesaSurface specifies the materials to use for the mesa biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeMesaSurface = {
		/** ClayMaterial is the runtime ID of the block to use for clay layers. Versions: 1.21.80 – 1.26.60 */
		clay_material: number;
		/** HardClayMaterial is the runtime ID of the block to use for hard clay layers. Versions: 1.21.80 – 1.26.60 */
		hard_clay_material: number;
		/** BrycePillars is true if the biome has bryce pillars, which are tall spire-like structures. Versions: 1.21.80 – 1.26.60 */
		bryce_pillars: boolean;
		/** HasForest is true if the biome has a forest. Versions: 1.21.80 – 1.26.60 */
		has_forest: boolean;
	};
	/**
	 * BiomeCappedSurface specifies the materials to use for the capped surface of a biome, such as in the Nether.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeCappedSurface = {
		/** FloorBlocks is a list of runtime IDs to use for the floor blocks. Versions: 1.21.80 – 1.26.60 */
		floor_blocks: number[];
		/** CeilingBlocks is a list of runtime IDs to use for the ceiling blocks. Versions: 1.21.80 – 1.26.60 */
		ceiling_blocks: number[];
		/** Versions: 1.21.80 – 1.26.60 */
		sea_block?: number | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		foundation_block?: number | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		beach_block?: number | undefined;
	};
	/**
	 * BiomeMultiNoiseRules specifies the rules for multi-noise biomes, which are biomes that are defined by
	 * multiple noise parameters instead of just temperature and humidity.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeMultiNoiseRules = {
		/** Temperature is the temperature level of the biome. Versions: 1.21.80 – 1.26.60 */
		temperature: number;
		/** Humidity is the humidity level of the biome. Versions: 1.21.80 – 1.26.60 */
		humidity: number;
		/** Altitude is the altitude level of the biome. Versions: 1.21.80 – 1.26.60 */
		altitude: number;
		/** Weirdness is the weirdness level of the biome. Versions: 1.21.80 – 1.26.60 */
		weirdness: number;
		/** Weight is the weight of the biome, with a higher weight being more likely to be selected. Versions: 1.21.80 – 1.26.60 */
		weight: number;
	};
	/**
	 * BiomeWeight defines the weight for a biome, used for weighted randomness.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeWeight = {
		/** Biome is the index of the biome name in the string list. Versions: 1.21.80 – 1.26.60 */
		biome: number;
		/** Weight is the weight of the biome, with a higher weight being more likely to be selected. Versions: 1.21.80 – 1.26.60 */
		weight: number;
	};
	/**
	 * BiomeTemperatureWeight defines the weight for a temperature, used for weighted randomness.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeTemperatureWeight = {
		/** Temperature is the temperature that can be selected. Versions: 1.21.80 – 1.26.60 */
		temperature: number;
		/** Weight is the weight of the temperature, with a higher weight being more likely to be selected. Versions: 1.21.80 – 1.26.60 */
		weight: number;
	};
	/**
	 * BiomeConsolidatedFeature represents a feature that is consolidated into a single feature for the biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeConsolidatedFeature = {
		/** Scatter defines how the feature is scattered in the biome. Versions: 1.21.80 – 1.26.60 */
		scatter: BiomeScatterParameter;
		/** Feature is the index of the feature's name in the string list. Versions: 1.21.80 – 1.26.60 */
		feature: number;
		/** Identifier is the index of the feature's identifier in the string list. Versions: 1.21.80 – 1.26.60 */
		identifier: number;
		/** Pass is the index of the feature's pass in the string list. Versions: 1.21.80 – 1.26.60 */
		pass: number;
		/** CanUseInternal is true if the feature can use internal features. Versions: 1.21.80 – 1.26.60 */
		can_use_internal: boolean;
	};
	/**
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeScatterParameter = {
		/** Coordinates is a list of coordinate rules to scatter the feature within. Versions: 1.21.80 – 1.26.60 */
		coordinates: BiomeCoordinate[];
		/** EvaluationOrder is the order in which the coordinates are evaluated. Versions: 1.21.80 – 1.26.60 */
		evaluation_order: "xyz" | "xzy" | "yxz" | "yzx" | "zxy" | "zyx" | number;
		/** ChancePercentType is the type of expression operation to use for the chance percent. Versions: 1.21.80 – 1.26.60 */
		chance_percent_type: number;
		/** ChancePercent is the index of the chance expression in the string list. Versions: 1.21.80 – 1.26.60 */
		chance_percent: number;
		/** ChanceNumerator is the numerator of the chance expression. Versions: 1.21.80 – 1.26.60 */
		chance_numerator: number;
		/** ChanceDenominator is the denominator of the chance expression. Versions: 1.21.80 – 1.26.60 */
		chance_denominator: number;
		/** IterationsType is the type of expression operation to use for the iterations. Versions: 1.21.80 – 1.26.60 */
		iterations_type: number;
		/** Iterations is the index of the iterations expression in the string list. Versions: 1.21.80 – 1.26.60 */
		iterations: number;
	};
	/**
	 * BiomeCoordinate specifies coordinate rules for where features can be scattered in the biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeCoordinate = {
		/** MinValueType is the type of expression operation to use for the minimum value. Versions: 1.21.80 – 1.26.60 */
		min_value_type: number;
		/** MinValue is the index of the minimum value expression in the string list. Versions: 1.21.80 – 1.26.60 */
		min_value: number;
		/** MaxValueType is the type of expression operation to use for the maximum value. Versions: 1.21.80 – 1.26.60 */
		max_value_type: number;
		/** MaxValue is the index of the maximum value expression in the string list. Versions: 1.21.80 – 1.26.60 */
		max_value: number;
		/** GridOffset is the offset of the grid, used for fixed grid and jittered grid distributions. Versions: 1.21.80 – 1.26.60 */
		grid_offset: number;
		/** GridStepSize is the step size of the grid, used for fixed grid and jittered grid distributions. Versions: 1.21.80 – 1.26.60 */
		grid_step_size: number;
		/** Distribution is the type of distribution to use for the coordinate. Versions: 1.21.80 – 1.26.60 */
		distribution: "single_valued" | "uniform" | "gaussian" | "inverse_gaussian" | "fixed_grid" | "jittered_grid" | "triangle" | number;
	};
	/**
	 * BiomeElementData are set rules to adjust the surface materials of the biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeElementData = {
		/** NoiseFrequencyScale is the frequency scale of the noise used to adjust the surface materials. Versions: 1.21.80 – 1.26.60 */
		noise_frequency_scale: number;
		/** NoiseLowerBound is the minimum noise value required to be selected. Versions: 1.21.80 – 1.26.60 */
		noise_lower_bound: number;
		/** NoiseUpperBound is the maximum noise value required to be selected. Versions: 1.21.80 – 1.26.60 */
		noise_upper_bound: number;
		/** HeightMinType is the type of expression operation to use for the minimum height. Versions: 1.21.80 – 1.26.60 */
		height_min_type: number;
		/** HeightMin is the index of the minimum height expression in the string list. Versions: 1.21.80 – 1.26.60 */
		height_min: number;
		/** HeightMaxType is the type of expression operation to use for the maximum height. Versions: 1.21.80 – 1.26.60 */
		height_max_type: number;
		/** HeightMax is the index of the maximum height expression in the string list. Versions: 1.21.80 – 1.26.60 */
		height_max: number;
		/** AdjustedMaterials is the materials to use for the surface layers of the biome if selected. Versions: 1.21.80 – 1.26.60 */
		adjusted_materials: BiomeSurfaceMaterial;
	};
	/**
	 * BiomeOverworldRules specifies a list of transformation rules to apply to different parts of the overworld.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeOverworldRules = {
		/** HillsTransformations is a list of weighted biome transformations to apply to hills. Versions: 1.21.80 – 1.26.60 */
		hills_transformations: BiomeWeight[];
		/** MutateTransformations is a list of weighted biome transformations to apply to mutated biomes. Versions: 1.21.80 – 1.26.60 */
		mutate_transformations: BiomeWeight[];
		/** RiverTransformations is a list of weighted biome transformations to apply to rivers. Versions: 1.21.80 – 1.26.60 */
		river_transformations: BiomeWeight[];
		/** ShoreTransformations is a list of weighted biome transformations to apply to shores. Versions: 1.21.80 – 1.26.60 */
		shore_transformations: BiomeWeight[];
		/** PreHillsEdgeTransformations is a list of conditional transformations to apply to the edges of hills. Versions: 1.21.80 – 1.26.60 */
		pre_hills_edge_transformations: BiomeConditionalTransformation[];
		/** PostShoreEdgeTransformations is a list of conditional transformations to apply to the edges of shores. Versions: 1.21.80 – 1.26.60 */
		post_shore_edge_transformations: BiomeConditionalTransformation[];
		/** ClimateTransformations is a list of weighted temperature transformations to apply to the biome's climate. Versions: 1.21.80 – 1.26.60 */
		climate_transformations: BiomeTemperatureWeight[];
	};
	/**
	 * BiomeConditionalTransformation is the legacy method of transforming biomes.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeConditionalTransformation = {
		/** WeightedBiomes is a list of biomes and their weights. Versions: 1.21.80 – 1.26.60 */
		weighted_biomes: BiomeWeight[];
		/** ConditionJSON is an index of the condition JSON data in the string list. Versions: 1.21.80 – 1.26.60 */
		condition_json: number;
		/** MinPassingNeighbours is the minimum number of neighbours that must pass the condition for the transformation to be applied. Versions: 1.21.80 – 1.26.60 */
		min_passing_neighbours: number;
	};
	/**
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type packet_player_location = {
		/** Type is the action that is being performed. It is one of the constants above. Versions: 1.21.80 – 1.26.60 */
		type: "coordinates" | "type_hide" | number;
		/** As of 1.26.40 the target entity comes first and the type is an unsigned varint. Versions: 1.21.80 – 1.26.60 */
		entity_unique_id: bigint;
		/** Versions: 1.21.80 – 1.26.60 */
		position?: vec3f | undefined;
		/** Currently always zero. Versions: 1.26.40 – 1.26.60 */
		unused?: number | undefined;
	};
	/**
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type packet_clientbound_controls_scheme = {
		/** Scheme is the scheme that the client should use. It is one of the constants above. Versions: 1.21.80 – 1.26.60 */
		scheme: "locked_player_relative_strafe" | "camera_relative" | "camera_relative_strafe" | "player_relative" | "player_relative_strafe" | number;
	};
	/**
	 * Versions: 1.21.90 – 1.26.60
	 */
	export type HeightMapDataType = "no_data" | "has_data" | "too_high" | "too_low" | "all_copied" | number;
	/**
	 * ServerScriptDebugDrawer instructs the client to render debug shapes for development visualisations.
	 * Versions: 1.21.90 – 1.26.60
	 */
	export type packet_server_script_debug_drawer = {
		/** Versions: 1.21.90 – 1.26.60 */
		shapes: {
			network_id: bigint;
			shape_type?: "line" | "box" | "sphere" | "circle" | "text" | "arrow" | number | undefined;
			location?: vec3f | undefined;
			scale?: number | undefined;
			rotation?: vec3f | undefined;
			time_left?: number | undefined;
			color?: number | undefined;
			text?: string | undefined;
			box_bound?: vec3f | undefined;
			line_end_location?: vec3f | undefined;
			arrow_head_length?: number | undefined;
			arrow_head_radius?: number | undefined;
			segment_count?: number | undefined;
		}[];
	};
	/**
	 * Versions: 1.21.100 – 1.26.60
	 */
	export type EaseType = "Linear" | "Spring" | "InQuad" | "OutQuad" | "InOutQuad" | "InCubic" | "OutCubic" | "InOutCubic" | "InQuart" | "OutQuart" | "InOutQuart" | "InQuint" | "OutQuint" | "InOutQuint" | "InSine" | "OutSine" | "InOutSine" | "InExpo" | "OutExpo" | "InOutExpo" | "InCirc" | "OutCirc" | "InOutCirc" | "InBounce" | "OutBounce" | "InOutBounce" | "InBack" | "OutBack" | "InOutBack" | "InElastic" | "OutElastic" | "InOutElastic" | number | "InverseLerp";
	/**
	 * Versions: 1.21.111 – 1.26.60
	 */
	export type GameRuleI32 = {
		/** Versions: 1.21.111 – 1.26.60 */
		name: string;
		/** Versions: 1.21.111 – 1.26.60 */
		editable: boolean;
		/** Versions: 1.21.111 – 1.26.60 */
		type: "bool" | "int" | "float" | number;
		/** Versions: 1.21.111 – 1.26.60 */
		value?: boolean | number | undefined;
	};
	/**
	 * Versions: 1.21.111 – 1.26.60
	 */
	export type GameRuleVarint = {
		/** Versions: 1.21.111 – 1.26.60 */
		name: string;
		/** Versions: 1.21.111 – 1.26.60 */
		editable: boolean;
		/** Versions: 1.21.111 – 1.26.60 */
		type: "bool" | "int" | "float" | number;
		/** Versions: 1.21.111 – 1.26.60 */
		value?: boolean | number | undefined;
	};
	/**
	 * Versions: 1.21.111 – 1.26.60
	 */
	export type ArmorDamageEntry = {
		/** Versions: 1.21.111 – 1.26.60 */
		armor_slot: "helmet" | "chestplate" | "leggings" | "boots" | "body" | number;
		/** Versions: 1.21.111 – 1.26.60 */
		damage: number;
	};
	/**
	 * ServerBoundPackSettingChange
	 * Versions: 1.21.111 – 1.26.60
	 */
	export type packet_serverbound_pack_setting_change = {
		/** Versions: 1.21.111 – 1.26.60 */
		pack_id: string;
		/** Versions: 1.21.111 – 1.26.60 */
		pack_setting: {
			name: string;
			type: "float" | "bool" | "string" | number | "string_list";
			value?: number | boolean | string | string[] | undefined;
		};
	};
	/**
	 * CameraRotationOption represents a rotation keyframe option for spline instructions.
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type CameraRotationOption = {
		/** Value is the rotation value for the keyframe. Versions: 1.21.120 – 1.26.60 */
		value: vec3f;
		/** Time is the time of the keyframe within the spline. Versions: 1.21.120 – 1.26.60 */
		time: number;
		/** Versions: 1.26.0 – 1.26.60 */
		has_ease_type?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		ease_type?: number | string | undefined;
	};
	/**
	 * CameraSplineInstruction represents a camera spline instruction definition.
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type CameraSplineInstruction = {
		/** TotalTime is the total time for the spline animation. Versions: 1.21.120 – 1.26.60 */
		total_time: number;
		/** Versions: 1.21.120 – 1.21.130 */
		ease_type?: CameraSplineEaseType | undefined;
		/** Curve is the list of curve points defining the spline. Versions: 1.21.120 – 1.26.60 */
		curve: vec3f[];
		/** ProgressKeyFrames is a list of key frames for the spline progress. Versions: 1.21.120 – 1.26.60 */
		progress_key_frames: vec2f[] | CameraProgressOption[];
		/** RotationOptions is a list of rotation keyframes for the spline. Versions: 1.21.120 – 1.26.60 */
		rotation_options: CameraRotationOption[];
		/** Versions: 1.26.0 – 1.26.60 */
		has_spline_type?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		spline_type?: number | string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		spline_identifier?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		load_from_json?: boolean | undefined;
	};
	/**
	 * BiomeReplacementData represents data for biome replacements.
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type BiomeReplacementData = {
		/** Biome is the biome ID to replace. Versions: 1.21.120 – 1.26.60 */
		biome: number;
		/** Dimension is the dimension ID where the replacement applies. Versions: 1.21.120 – 1.26.60 */
		dimension: number;
		/** TargetBiomes is a list of target biome IDs for the replacement. Versions: 1.21.120 – 1.26.60 */
		target_biomes: number[];
		/** Amount is the amount of replacement to apply. Versions: 1.21.120 – 1.26.60 */
		amount: number;
		/** NoiseFrequencyScale is the noise frequency scale to use for replacement selection. Versions: 1.21.120 – 1.26.60 */
		noise_frequency_scale: number;
		/** ReplacementIndex is the index of the replacement. Versions: 1.21.120 – 1.26.60 */
		replacement_index: number;
	};
	/**
	 * Versions: 1.21.120 – 1.26.0
	 */
	export type CameraSplineEaseType = "catmull_rom" | "linear" | number;
	/**
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type ParameterKeyframeValue = {
		/** Time is the time of the keyframe. Versions: 1.21.120 – 1.26.60 */
		time: number;
		/** Value is the value at the keyframe. Versions: 1.21.120 – 1.26.60 */
		value: vec3f;
	};
	/**
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type GraphicsOverrideParameterType = "sky_zenith_color" | number | "sky_horizon_color" | "horizon_blend_min" | "horizon_blend_max" | "horizon_blend_start" | "horizon_blend_mie_start" | "rayleigh_strength" | "sun_mie_strength" | "moon_mie_strength" | "sun_glare_shape" | "chlorophyll" | "cdom" | "suspended_sediment" | "waves_depth" | "waves_frequency" | "waves_frequency_scaling" | "waves_speed" | "waves_speed_scaling" | "waves_shape" | "waves_octaves" | "waves_mix" | "waves_pull" | "waves_direction_increment" | "midtones_contrast" | "highlights_contrast" | "shadows_contrast" | "highlights_gain" | "highlights_gamma" | "highlights_offset" | "highlights_saturation" | "midtones_gain" | "midtones_gamma" | "midtones_offset" | "midtones_saturation" | "shadows_gain" | "shadows_gamma" | "shadows_offset" | "shadows_saturation" | "highlights_min" | "shadows_max" | "temperature" | "sun_color" | "sun_illuminance" | "moon_color" | "moon_illuminance" | "flash_color" | "flash_illuminance" | "ambient_color" | "ambient_illuminance" | "emissive_desaturation" | "sky_intensity" | "orbital_offset_degrees";
	/**
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type packet_graphics_override_parameter = {
		/** Versions: 1.21.120 – 1.26.60 */
		values: ParameterKeyframeValue[];
		/** Versions: 1.21.120 – 1.26.60 */
		biome_identifier: string;
		/** Versions: 1.21.120 – 1.26.60 */
		parameter_type: GraphicsOverrideParameterType;
		/** Versions: 1.21.120 – 1.26.60 */
		reset: boolean;
		/** Versions: 1.26.0 – 1.26.60 */
		float_value?: number | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		vec3_value?: vec3f | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		player_id?: string | undefined;
	};
	/**
	 * Versions: 1.21.130 – 1.26.60
	 */
	export type DebugMarkerData = {
		/** Versions: 1.21.130 – 1.26.60 */
		text: string;
		/** Versions: 1.21.130 – 1.26.60 */
		position: vec3f;
		/** Versions: 1.21.130 – 1.26.60 */
		color: number;
		/** Versions: 1.21.130 – 1.26.60 */
		duration: Int64;
	};
	/**
	 * Versions: 1.21.130 – 1.26.60
	 */
	export type packet_clientbound_data_store = {
		/** Versions: 1.21.130 – 1.26.0 */
		entries?: {
			type: "update" | "change" | "removal" | number;
			name?: string | undefined;
			property?: string | undefined;
			path?: string | undefined;
			data_type?: "double" | "bool" | "string" | number | undefined;
			data?: number | boolean | string | undefined;
			update_count?: number | undefined;
			path_update_count?: number | undefined;
		}[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		updates?: DataStoreChangeEntry[] | undefined;
	};
	/**
	 * Versions: 1.21.130 – 1.26.60
	 */
	export type packet_serverbound_data_store = {
		/** Versions: 1.21.130 – 1.26.60 */
		name: string;
		/** Versions: 1.21.130 – 1.26.60 */
		property: string;
		/** Versions: 1.21.130 – 1.26.60 */
		path: string;
		/** Versions: 1.21.130 – 1.26.60 */
		data_type: "double" | "bool" | "string" | number;
		/** Versions: 1.21.130 – 1.26.60 */
		data?: number | boolean | string | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		update_count: number;
		/** Versions: 1.26.0 – 1.26.60 */
		path_update_count?: number | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type CameraProgressOption = {
		/** Versions: 1.26.0 – 1.26.60 */
		value: number;
		/** Versions: 1.26.0 – 1.26.60 */
		time: number;
		/** Versions: 1.26.0 – 1.26.60 */
		has_ease_type: boolean;
		/** Versions: 1.26.0 – 1.26.60 */
		ease_type?: number | string | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type CameraSplineDefinition = {
		/** Versions: 1.26.0 – 1.26.60 */
		name: string;
		/** Versions: 1.26.0 */
		instruction?: CameraSplineInstruction | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		total_time?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		spline_type?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		control_points?: vec3f[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		progress_key_frames?: CameraProgressOption[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		rotation_key_frames?: CameraRotationOption[] | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type CameraAimAssistActorPriorityData = {
		/** Versions: 1.26.0 – 1.26.60 */
		preset_index: number;
		/** Versions: 1.26.0 – 1.26.60 */
		category_index: number;
		/** Versions: 1.26.0 – 1.26.60 */
		actor_index: number;
		/** Versions: 1.26.0 – 1.26.60 */
		priority: number;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type MemoryCategoryCounter = {
		/** Versions: 1.26.0 – 1.26.60 */
		category: "unknown" | "invalid_size_unknown" | "actor" | "actor_animation" | "actor_rendering" | "balancer" | "block_ticking_queues" | "biome_storage" | "cereal" | "circuit_system" | "client" | "commands" | "db_storage" | "debug" | "documentation" | "ecs_systems" | "fmod" | "fonts" | "im_gui" | "input" | "json_ui" | "json_ui_control_factory_json" | "json_ui_control_tree" | "json_ui_control_tree_control_element" | "json_ui_control_tree_populate_data_binding" | "json_ui_control_tree_populate_focus" | "json_ui_control_tree_populate_layout" | "json_ui_control_tree_populate_other" | "json_ui_control_tree_populate_sprite" | "json_ui_control_tree_populate_text" | "json_ui_control_tree_populate_tts" | "json_ui_control_tree_visibility" | "json_ui_create_ui" | "json_ui_defs" | "json_ui_layout_manager" | "json_ui_layout_manager_remove_dependencies" | "json_ui_layout_manager_init_variable" | "languages" | "level" | "level_structures" | "level_chunk" | "level_chunk_gen" | "level_chunk_gen_thread_local" | "network" | "marketplace" | "material_dragon_compiled_definition" | "material_dragon_material" | "material_dragon_resource" | "material_dragon_uniform_map" | "material_render_material" | "material_render_material_group" | "material_variation_manager" | "molang" | "ore_ui" | "persona" | "player" | "render_chunk" | "render_chunk_index_buffer" | "render_chunk_vertex_buffer" | "rendering" | "rendering_library" | "request_log" | "resource_packs" | "sound" | "sub_chunk_biome_data" | "sub_chunk_block_data" | "sub_chunk_light_data" | "textures" | "vr" | "weather_renderer" | "world_generator" | "tasks" | "test" | "scripting" | "scripting_runtime" | "scripting_context" | "scripting_context_bindings_mc" | "scripting_context_bindings_gt" | "scripting_context_run" | "data_driven_ui" | "data_driven_ui_defs" | number | "light_volume_manager" | "gameface" | "gameface_system" | "gameface_dom" | "gameface_css" | "gameface_display" | "gameface_temp_allocator" | "gameface_pool_allocator" | "gameface_dump" | "gameface_media" | "gameface_json" | "gameface_script_engine" | "blobs" | "ore_ui_client" | "persona_pieces" | "persona_animations" | "persona_characters" | "persona_skin_packs" | "persona_repo" | "rendering_bgfx_init" | "rendering_bgfx_start_frame" | "rendering_block_tessellator" | "rendering_end_frame" | "rendering_graphics_tasks_init" | "rendering_polygon_operator_pool" | "rendering_pbr_texture_data" | "rendering_render_registry" | "rendering_setup" | "rendering_vertices" | "test_load_test_tags" | "gameface_script" | "gameface_layout" | "executable";
		/** Versions: 1.26.0 – 1.26.60 */
		bytes: Int64;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type VoxelCells = {
		/** Versions: 1.26.0 – 1.26.60 */
		x_size: number;
		/** Versions: 1.26.0 – 1.26.60 */
		y_size: number;
		/** Versions: 1.26.0 – 1.26.60 */
		z_size: number;
		/** Versions: 1.26.0 – 1.26.60 */
		storage: number[];
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type VoxelShape = {
		/** Versions: 1.26.0 – 1.26.60 */
		cells: VoxelCells;
		/** Versions: 1.26.0 – 1.26.60 */
		x_coordinates: number[];
		/** Versions: 1.26.0 – 1.26.60 */
		y_coordinates: number[];
		/** Versions: 1.26.0 – 1.26.60 */
		z_coordinates: number[];
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type VoxelShapeNameEntry = {
		/** Versions: 1.26.0 – 1.26.60 */
		name: string;
		/** Versions: 1.26.0 – 1.26.60 */
		id: number;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type GatheringJoinInfo = {
		/** Versions: 1.26.0 – 1.26.60 */
		experience_id: string;
		/** Versions: 1.26.0 – 1.26.60 */
		experience_name: string;
		/** Versions: 1.26.0 – 1.26.60 */
		experience_world_id?: string | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		experience_world_name?: string | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		creator_id: string;
		/** Versions: 1.26.0 */
		store_id?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		target_id?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		scenario_id?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		server_id?: string | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type ServerJoinInformation = {
		/** Versions: 1.26.0 – 1.26.60 */
		has_gathering_info: boolean;
		/** Versions: 1.26.0 – 1.26.60 */
		gathering_info?: GatheringJoinInfo | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		store_entry_point_info?: StoreEntryPointInfo | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		presence_info?: PresenceInfo | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_clientbound_data_driven_ui_show_screen = {
		/** Versions: 1.26.0 – 1.26.60 */
		screen_id: string;
		/** Versions: 1.26.10 – 1.26.60 */
		form_id?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		data_instance_id?: number | undefined;
	};
	/**
	 * Versions: 1.26.0
	 */
	export type packet_clientbound_data_driven_ui_close_all_screens = Record<string, never>;
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_clientbound_data_driven_ui_reload = Record<string, never>;
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_clientbound_texture_shift = {
		/** Versions: 1.26.0 – 1.26.60 */
		action: "invalid" | "initialize" | "start" | "set_enabled" | "sync" | number;
		/** Versions: 1.26.0 – 1.26.60 */
		collection_name: string;
		/** Versions: 1.26.0 – 1.26.60 */
		from_step: string;
		/** Versions: 1.26.0 – 1.26.60 */
		to_step: string;
		/** Versions: 1.26.0 – 1.26.60 */
		all_steps: string[];
		/** Versions: 1.26.0 – 1.26.60 */
		current_length_ticks: bigint;
		/** Versions: 1.26.0 – 1.26.60 */
		total_length_ticks: bigint;
		/** Versions: 1.26.0 – 1.26.60 */
		enabled: boolean;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_voxel_shapes = {
		/** Versions: 1.26.0 – 1.26.60 */
		shapes: VoxelShape[];
		/** Versions: 1.26.0 – 1.26.60 */
		name_map: VoxelShapeNameEntry[];
		/** Versions: 1.26.10 – 1.26.60 */
		custom_shape_count?: number | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_camera_spline = {
		/** Versions: 1.26.0 – 1.26.60 */
		splines: CameraSplineDefinition[];
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_camera_aim_assist_actor_priority = {
		/** Versions: 1.26.0 – 1.26.60 */
		priority_data: CameraAimAssistActorPriorityData[];
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type StoreEntryPointInfo = {
		/** Versions: 1.26.10 – 1.26.60 */
		store_id: string;
		/** Versions: 1.26.10 – 1.26.60 */
		store_name: string;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type PresenceInfo = {
		/** Versions: 1.26.10 – 1.26.60 */
		experience_name?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		world_name?: string | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		rich_presence_id?: string | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type DataStorePropertyValue = {
		/** Versions: 1.26.10 – 1.26.60 */
		type: "none" | "bool" | "int64" | "string" | "map" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		value?: boolean | Int64 | string | DataStoreMapEntry[] | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type DataStoreMapEntry = {
		/** Versions: 1.26.10 – 1.26.60 */
		key: string;
		/** Versions: 1.26.10 – 1.26.60 */
		value: DataStorePropertyValue;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type DataStoreChangeEntry = {
		/** Versions: 1.26.10 – 1.26.60 */
		change_type: "update" | "change" | "removal" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		property?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		path?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		data_type?: "double" | "bool" | "string" | number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		data?: number | boolean | string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		update_count?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		path_update_count?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		new_value?: DataStorePropertyValue | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type WaypointWorldPosition = {
		/** Versions: 1.26.10 – 1.26.60 */
		position: vec3f;
		/** Versions: 1.26.10 – 1.26.60 */
		dimension_id: number;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type Waypoint = {
		/** Versions: 1.26.10 – 1.26.60 */
		update_flags: number;
		/** Versions: 1.26.10 – 1.26.60 */
		visible?: boolean | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		world_position?: WaypointWorldPosition | undefined;
		/** Versions: 1.26.10 */
		texture_id?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		color?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		client_position_authority?: boolean | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		actor_unique_id?: bigint | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		texture_path?: string | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		icon_size?: vec2f | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type LocatorBarWaypoint = {
		/** Versions: 1.26.10 – 1.26.60 */
		group_handle: string;
		/** Versions: 1.26.10 – 1.26.60 */
		waypoint: Waypoint;
		/** Versions: 1.26.10 – 1.26.60 */
		action: "none" | "add" | "remove" | "update" | number;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type SyncWorldClockStateData = {
		/** Versions: 1.26.10 – 1.26.60 */
		clock_id: bigint;
		/** Versions: 1.26.10 – 1.26.60 */
		time: number;
		/** Versions: 1.26.10 – 1.26.60 */
		paused: boolean;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type TimeMarkerData = {
		/** Versions: 1.26.10 – 1.26.60 */
		id: bigint;
		/** Versions: 1.26.10 – 1.26.60 */
		name: string;
		/** Versions: 1.26.10 – 1.26.60 */
		time: number;
		/** Versions: 1.26.10 – 1.26.60 */
		period?: number | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type WorldClockData = {
		/** Versions: 1.26.10 – 1.26.60 */
		id: bigint;
		/** Versions: 1.26.10 – 1.26.60 */
		name: string;
		/** Versions: 1.26.10 – 1.26.60 */
		time: number;
		/** Versions: 1.26.10 – 1.26.60 */
		paused: boolean;
		/** Versions: 1.26.10 – 1.26.60 */
		time_markers: TimeMarkerData[];
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type AttributeLayerSettings = {
		/** Versions: 1.26.10 – 1.26.60 */
		priority: number;
		/** Versions: 1.26.10 – 1.26.60 */
		weight_type: "float" | "string" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		float_weight?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		string_weight?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		enabled: boolean;
		/** Versions: 1.26.10 – 1.26.60 */
		transitions_paused: boolean;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type AttributeData = {
		/** Versions: 1.26.10 – 1.26.60 */
		type: "bool" | "float" | "colour" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		bool_value?: boolean | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		bool_operation?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		float_value?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		float_operation?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		float_constraint_min?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		float_constraint_max?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		colour_value?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		colour_operation?: number | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type EnvironmentAttributeData = {
		/** Versions: 1.26.10 – 1.26.60 */
		attribute_name: string;
		/** Versions: 1.26.10 – 1.26.60 */
		from_attribute?: AttributeData | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		attribute?: AttributeData | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		to_attribute?: AttributeData | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		current_transition_ticks?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		total_transition_ticks?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		ease_type?: number | EaseType | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		local_transition_ticks?: number | undefined;
		/** Versions: 1.26.30 – 1.26.51 */
		noise_transition?: boolean | undefined;
		/** Versions: 1.26.60 */
		payload_type?: "constant" | "transition" | "noise_transition" | number | undefined;
		/** Versions: 1.26.60 */
		clock_name?: string | undefined;
		/** Versions: 1.26.60 */
		noise_name?: string | undefined;
		/** Versions: 1.26.60 */
		noise_alignment?: {
			type: "min_local_transition_end" | number;
			value: number;
		} | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type AttributeLayerData = {
		/** Versions: 1.26.10 – 1.26.60 */
		name: string;
		/** Versions: 1.26.10 – 1.26.60 */
		dimension_id: number;
		/** Versions: 1.26.10 – 1.26.60 */
		settings: AttributeLayerSettings;
		/** Versions: 1.26.10 – 1.26.60 */
		environment_attributes: EnvironmentAttributeData[];
		/** Versions: 1.26.30 – 1.26.51 */
		noise_name?: string | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_clientbound_data_driven_ui_close_screen = {
		/** Versions: 1.26.10 – 1.26.60 */
		form_id?: number | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_resource_packs_ready_for_validation = Record<string, never>;
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_locator_bar = {
		/** Versions: 1.26.10 – 1.26.60 */
		waypoints: LocatorBarWaypoint[];
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_party_changed = {
		/** Versions: 1.26.10 */
		party_id?: string | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		party_info?: PartyInfo | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_serverbound_data_driven_screen_closed = {
		/** Versions: 1.26.10 – 1.26.60 */
		form_id?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		close_reason: "programmatic_close" | "programmatic_close_all" | "client_canceled" | "user_busy" | "invalid_form" | number | string;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_sync_world_clocks = {
		/** Versions: 1.26.10 – 1.26.60 */
		payload_type: "sync_state" | "initialize_registry" | "add_time_marker" | "remove_time_marker" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		sync_states?: SyncWorldClockStateData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		clocks?: WorldClockData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		add_clock_id?: bigint | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		add_time_markers?: TimeMarkerData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		remove_clock_id?: bigint | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		remove_time_marker_ids?: bigint[] | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_clientbound_attribute_layer_sync = {
		/** Versions: 1.26.10 – 1.26.60 */
		payload_type: "update_layers" | "update_settings" | "update_environment" | "remove_environment" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		layers?: AttributeLayerData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		layer_name?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		dimension_id?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		settings?: AttributeLayerSettings | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		environment_attributes?: EnvironmentAttributeData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		remove_attribute_names?: string[] | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.30
	 */
	export type ItemV4NetIdVariant = {
		/** Versions: 1.26.20 – 1.26.30 */
		type: "item_stack_net_id" | "item_stack_request_id" | "item_stack_legacy_request_id" | number;
		/** Versions: 1.26.20 – 1.26.30 */
		id: number;
	};
	/**
	 * As of 1.26.40 the standalone `Item` encoding is gone: everything that used it now uses `ItemV4`.
	 * As of 1.26.40 the net ID is a plain zigzag32 again; the oneOf variant tag that preceded it is gone.
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ItemV4 = {
		/** Versions: 1.26.20 – 1.26.60 */
		network_id: number;
		/** Versions: 1.26.20 – 1.26.60 */
		count: number;
		/** Versions: 1.26.20 – 1.26.60 */
		metadata: number;
		/** Versions: 1.26.20 – 1.26.60 */
		has_stack_id: boolean;
		/** Versions: 1.26.20 – 1.26.60 */
		stack_id?: ItemV4NetIdVariant | number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		block_runtime_id: number;
		/** Versions: 1.26.20 – 1.26.60 */
		extra?: ItemExtraDataWithBlockingTick | ItemExtraDataWithoutBlockingTick | undefined;
	};
	/**
	 * BiomeSurfaceBuilder describes how one layer of a biome's surface is generated.
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type BiomeSurfaceBuilder = {
		/** Versions: 1.26.20 – 1.26.60 */
		surface_materials?: BiomeSurfaceMaterial | undefined;
		/** HasDefaultOverworldSurface is true if the biome has a default overworld surface. Versions: 1.26.20 – 1.26.60 */
		has_default_overworld_surface: boolean;
		/** HasSwampSurface is true if the biome has a swamp surface. Versions: 1.26.20 – 1.26.60 */
		has_swamp_surface: boolean;
		/** HasFrozenOceanSurface is true if the biome has a frozen ocean surface. Versions: 1.26.20 – 1.26.60 */
		has_frozen_ocean_surface: boolean;
		/** HasEndSurface is true if the biome has an end surface. Versions: 1.26.20 – 1.26.60 */
		has_end_surface: boolean;
		/** Versions: 1.26.20 – 1.26.60 */
		mesa_surface?: BiomeMesaSurface | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		capped_surface?: BiomeCappedSurface | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		noise_gradient_surface?: BiomeNoiseGradientSurface | undefined;
	};
	/**
	 * BiomeNoiseGradientSurface generates a surface by sampling a named noise function.
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type BiomeNoiseGradientSurface = {
		/** Versions: 1.26.20 – 1.26.60 */
		non_replaceable_blocks: number[];
		/** Versions: 1.26.20 – 1.26.60 */
		gradient_blocks: number[] | BiomeNoiseBlockSpecifier[];
		/** Versions: 1.26.20 – 1.26.60 */
		noise_seed: string;
		/** Versions: 1.26.20 – 1.26.60 */
		first_octave: number;
		/** Versions: 1.26.20 – 1.26.60 */
		amplitudes: number[];
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type EntityDiagnosticTimingInfo = {
		/** Versions: 1.26.20 – 1.26.60 */
		display_name: string;
		/** Versions: 1.26.20 – 1.26.60 */
		entity: string;
		/** Versions: 1.26.20 – 1.26.60 */
		duration_nanos: Int64;
		/** Versions: 1.26.20 – 1.26.60 */
		percent_of_total: number;
		/** Versions: 1.26.51 – 1.26.60 */
		position?: vec3f | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		dimension?: string | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type SystemDiagnosticTimingInfo = {
		/** Versions: 1.26.20 – 1.26.60 */
		display_name: string;
		/** Versions: 1.26.20 – 1.26.60 */
		system_index: Int64;
		/** Versions: 1.26.20 – 1.26.60 */
		duration_nanos: Int64;
		/** Versions: 1.26.20 – 1.26.60 */
		percent_of_total: number;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type PrimitiveShape = {
		/** Versions: 1.26.20 – 1.26.60 */
		network_id: bigint;
		/** Versions: 1.26.20 – 1.26.60 */
		type?: "line" | "box" | "sphere" | "circle" | "text" | "arrow" | number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		location?: vec3f | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		scale?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		rotation?: vec3f | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		total_time_left?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		max_render_distance?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		color?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		dimension_id?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		attached_to_entity_id?: bigint | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		extra_shape_data?: ShapeLine | ShapeBox | ShapeSphere | ShapeCircle | ShapeText | ShapeArrow | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeLine = {
		/** Versions: 1.26.20 – 1.26.60 */
		end_location: vec3f;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeBox = {
		/** Versions: 1.26.20 – 1.26.60 */
		box_bound: vec3f;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeSphere = {
		/** Versions: 1.26.20 – 1.26.60 */
		segment_count?: number | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeCircle = {
		/** Versions: 1.26.20 – 1.26.60 */
		segment_count?: number | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeText = {
		/** Versions: 1.26.20 – 1.26.60 */
		text: string;
		/** Versions: 1.26.20 – 1.26.60 */
		use_rotation?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		background_color?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		depth_test?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		show_backface?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		show_backface_text?: boolean | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeArrow = {
		/** Versions: 1.26.20 – 1.26.60 */
		end_location: vec3f;
		/** Versions: 1.26.20 – 1.26.60 */
		arrow_head_length: number;
		/** Versions: 1.26.20 – 1.26.60 */
		arrow_head_radius: number;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type PartyInfo = {
		/** Versions: 1.26.20 – 1.26.60 */
		party_id: string;
		/** Versions: 1.26.20 – 1.26.60 */
		party_leader: boolean;
	};
	/**
	 * PrimitiveShapes is a packet sent by the server to instruct the client to render one or more shapes in the world.
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type packet_primitive_shapes = {
		/** Versions: 1.26.20 – 1.26.60 */
		shapes: PrimitiveShape[];
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type packet_server_store_info = {
		/** Versions: 1.26.20 – 1.26.60 */
		store_info?: StoreEntryPointInfo | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type packet_server_presence_info = {
		/** Versions: 1.26.20 – 1.26.60 */
		presence_info?: PresenceInfo | undefined;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type ItemV4s = ItemV4[];
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type vec3i8 = {
		/** Versions: 1.26.30 – 1.26.60 */
		x: number;
		/** Versions: 1.26.30 – 1.26.60 */
		y: number;
		/** Versions: 1.26.30 – 1.26.60 */
		z: number;
	};
	/**
	 * Versions: 1.26.30
	 */
	export type TransactionActionsAuthInput = {
		source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
		inventory_id?: WindowIDZigzag32 | undefined;
		action?: number | undefined;
		flags?: number | undefined;
		slot: number;
		old_item: Item;
		new_item: Item;
	}[];
	/**
	 * Versions: 1.26.30
	 */
	export type TransactionLegacyAuthInput = {
		/** Versions: 1.26.30 */
		legacy_request_id: number;
		/** Versions: 1.26.30 */
		legacy_transactions?: {
			container_id: number;
			changed_slots: {
				slot_id: number;
			}[];
		}[] | undefined;
	};
	/**
	 * As of 1.26.30, sounds are now sent as strings with their registry name
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type ServerSoundHandle = Int64;
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type SoundEventIdentifier = string;
	/**
	 * BiomeNoiseBlockSpecifier picks a block based on where a noise sample falls in a range. As of 1.26.30 this
	 * replaced the plain block runtime id previously used for `gradient_blocks`.
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type BiomeNoiseBlockSpecifier = {
		/** Versions: 1.26.30 – 1.26.60 */
		noise: string;
		/** Versions: 1.26.30 – 1.26.60 */
		threshold: number;
		/** Versions: 1.26.30 – 1.26.60 */
		min: number;
		/** Versions: 1.26.30 – 1.26.60 */
		max: number;
		/** Versions: 1.26.30 – 1.26.60 */
		block: number;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type WhiskerScopeDataSummary = {
		/** Versions: 1.26.30 – 1.26.60 */
		label: string;
		/** Versions: 1.26.30 – 1.26.60 */
		indentation: string;
		/** Versions: 1.26.30 – 1.26.60 */
		total_high_cost_ns: Int64;
		/** Versions: 1.26.30 – 1.26.60 */
		total_mid_cost_ns: Int64;
		/** Versions: 1.26.30 – 1.26.60 */
		total_low_cost_ns: Int64;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type packet_clientbound_update_sound_data = {
		/** Versions: 1.26.30 – 1.26.60 */
		server_sound_handle: ServerSoundHandle;
		/** Versions: 1.26.30 */
		sound_event?: string | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		stop?: {
			unused: number;
		} | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		volume?: {
			unused: number;
			volume: number;
		} | number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		pitch?: {
			unused: number;
			pitch: number;
		} | number | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		fade?: {
			unused: number;
			target_volume: number;
			duration: number;
		} | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		seek_to?: {
			unused: number;
			seconds: number;
		} | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		pause?: {
			unused: number;
		} | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		resume?: {
			unused: number;
		} | undefined;
		/** Versions: 1.26.60 */
		type?: "stop" | "set_volume" | "set_pitch" | "fade" | "seek_to" | "pause" | "resume" | number | undefined;
		/** Versions: 1.26.60 */
		duration?: number | undefined;
		/** Versions: 1.26.60 */
		target_volume?: number | undefined;
		/** Versions: 1.26.60 */
		seconds?: number | undefined;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type packet_send_party_destination_cookie = {
		/** Versions: 1.26.30 – 1.26.60 */
		cookie: string;
		/** Versions: 1.26.30 – 1.26.60 */
		intent: string;
		/** Versions: 1.26.30 – 1.26.60 */
		destination_name: string;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type packet_party_destination_cookie_response = {
		/** Versions: 1.26.30 – 1.26.60 */
		cookie: string;
		/** Versions: 1.26.30 – 1.26.60 */
		accepted: boolean;
	};
	/**
	 * As of 1.26.40 each recipe kind is sent in its own array in packet_crafting_data, so the recipe type
	 * tag that used to prefix every entry is gone.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type ShapedRecipe = {
		/** Versions: 1.26.40 – 1.26.60 */
		recipe_id: LatinString;
		/** Versions: 1.26.40 – 1.26.60 */
		width: number;
		/** Versions: 1.26.40 – 1.26.60 */
		height: number;
		/** Flat input array, size of width*height Versions: 1.26.40 – 1.26.60 */
		input: RecipeIngredient[];
		/** Versions: 1.26.40 – 1.26.60 */
		output: ItemLegacy[];
		/** Versions: 1.26.40 – 1.26.60 */
		uuid: string;
		/** Versions: 1.26.40 – 1.26.60 */
		block: string;
		/** Versions: 1.26.40 – 1.26.60 */
		priority: number;
		/** Versions: 1.26.40 – 1.26.60 */
		assume_symmetry: boolean;
		/** Versions: 1.26.40 – 1.26.60 */
		unlocking_requirement?: RecipeUnlockingRequirement | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type ShapelessRecipe = {
		/** Versions: 1.26.40 – 1.26.60 */
		recipe_id: LatinString;
		/** Versions: 1.26.40 – 1.26.60 */
		input: RecipeIngredient[];
		/** Versions: 1.26.40 – 1.26.60 */
		output: ItemLegacy[];
		/** Versions: 1.26.40 – 1.26.60 */
		uuid: string;
		/** Versions: 1.26.40 – 1.26.60 */
		block: string;
		/** Versions: 1.26.40 – 1.26.60 */
		priority: number;
		/** Versions: 1.26.40 – 1.26.60 */
		unlocking_requirement?: RecipeUnlockingRequirement | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type MultiRecipe = {
		/** Versions: 1.26.40 – 1.26.60 */
		uuid: string;
		/** Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * SmithingTransformRecipe is a recipe specifically used for smithing tables. It has two input items and adds
	 * them together, resulting in a new item.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type SmithingTransformRecipe = {
		/** RecipeID is a unique ID of the recipe. This ID must be unique amongst all other types of recipes too, but its functionality is not exactly known. Versions: 1.26.40 – 1.26.60 */
		recipe_id: LatinString;
		/** Versions: 1.26.40 – 1.26.60 */
		template: RecipeIngredient;
		/** Base is the item that the Addition is being applied to in the smithing table. Versions: 1.26.40 – 1.26.60 */
		base: RecipeIngredient;
		/** Addition is the item that is being added to the Base item to result in a modified item. Versions: 1.26.40 – 1.26.60 */
		addition: RecipeIngredient;
		/** Result is the resulting item from the two items being added together. Versions: 1.26.40 – 1.26.60 */
		result: ItemLegacy;
		/** Tag is a serialized compound tag in the network little endian format. Versions: 1.26.40 – 1.26.60 */
		tag: string;
		/** RecipeNetworkID is a unique ID used to identify the recipe over network. Each recipe must have a unique network ID. Recommended is to just increment a variable for each unique recipe registered. This field must never be 0. Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type SmithingTrimRecipe = {
		/** Versions: 1.26.40 – 1.26.60 */
		recipe_id: LatinString;
		/** Versions: 1.26.40 – 1.26.60 */
		template: RecipeIngredient;
		/** Versions: 1.26.40 – 1.26.60 */
		input: RecipeIngredient;
		/** Versions: 1.26.40 – 1.26.60 */
		addition: RecipeIngredient;
		/** Versions: 1.26.40 – 1.26.60 */
		block: string;
		/** Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * 1.26.40 reworked most of this type: the three arrays are now varint-counted, the arm size and the piece
	 * types are numeric, the colours are little endian ints instead of strings, and the trusted flag and the
	 * profile hash were appended at the end.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type PersonaPieceType = "unknown" | "skeleton" | "body" | "skin" | "bottom" | "feet" | "dress" | "top" | "high_pants" | "hands" | "outerwear" | "facial_hair" | "mouth" | "eyes" | "hair" | "hood" | "back" | "face_accessory" | "head" | "legs" | "left_leg" | "right_leg" | "arms" | "left_arm" | "right_arm" | "capes" | "classic_skin" | "emote" | "unsupported" | number | "coco";
	/**
	 * As of 1.26.40 the packet-wide action is gone: every record carries its own action, written first as an
	 * unsigned varint (1 = add, 0 = remove) and then again as the legacy action ordinal byte (0 = add,
	 * 1 = remove). The trailing array of skin-verified booleans was removed as well.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type PlayerRecord = {
		/** Versions: 1.26.40 – 1.26.60 */
		type: "remove" | "add" | number;
		/** Versions: 1.26.40 – 1.26.60 */
		legacy_type: number;
		/** Versions: 1.26.40 – 1.26.60 */
		uuid?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		entity_unique_id?: bigint | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		username?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		xbox_user_id?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		platform_chat_id?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		build_platform?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		skin_data?: Skin | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		is_teacher?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		is_host?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		is_subclient?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		player_color?: number | undefined;
		/** Versions: 1.26.60 */
		play_fab_id?: string | undefined;
	};
	/**
	 * The ingredient encoding used inside auto-craft item stack request actions. It differs from
	 * `RecipeIngredient` in that the descriptor kind is numeric (and repeated as a byte) and the count is a
	 * little endian short.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type RecipeIngredient2 = {
		/** Versions: 1.26.40 – 1.26.60 */
		type: "invalid" | "name" | "molang" | "item_tag" | number;
		/** The descriptor kind again, as a byte. The reader ignores it in favour of the varint above. Versions: 1.26.40 – 1.26.60 */
		legacy_type: number;
		/** Versions: 1.26.40 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		metadata?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		expression?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		version?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		tag?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		count: number;
	};
	/**
	 * The item encoding used by the deprecated craft-results item stack request action. Unlike `ItemLegacy` it
	 * identifies the item by name through a descriptor rather than by network ID.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type ItemStackRequestInstanceDescriptor = {
		/** Versions: 1.26.40 – 1.26.60 */
		type: "invalid" | "name" | number;
		/** The descriptor kind again, as a byte. Versions: 1.26.40 – 1.26.60 */
		legacy_type: number;
		/** Versions: 1.26.40 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		metadata?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		count: number;
		/** Versions: 1.26.40 – 1.26.60 */
		block_runtime_id: number;
		/** Versions: 1.26.40 – 1.26.60 */
		extra?: ItemExtraDataWithoutBlockingTick | undefined;
	};
	/**
	 * Added in 1.26.40.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type SystemCategory = {
		/** Versions: 1.26.40 – 1.26.60 */
		category_name: string;
		/** Versions: 1.26.40 – 1.26.60 */
		system_index: Int64;
	};
	/**
	 * As of 1.26.40 the input flags are no longer a bitfield: they are sent as an optional list of the
	 * ordinals below. The values are unchanged from the old bit positions.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type InputData = "ascend" | "descend" | "north_jump" | "jump_down" | "sprint_down" | "change_height" | "jumping" | "auto_jumping_in_water" | "sneaking" | "sneak_down" | "up" | "down" | "left" | "right" | "up_left" | "up_right" | "want_up" | "want_down" | "want_down_slow" | "want_up_slow" | "sprinting" | "ascend_block" | "descend_block" | "sneak_toggle_down" | "persist_sneak" | "start_sprinting" | "stop_sprinting" | "start_sneaking" | "stop_sneaking" | "start_swimming" | "stop_swimming" | "start_jumping" | "start_gliding" | "stop_gliding" | "item_interact" | "block_action" | "item_stack_request" | "handled_teleport" | "emoting" | "missed_swing" | "start_crawling" | "stop_crawling" | "start_flying" | "stop_flying" | "received_server_data" | "client_predicted_vehicle" | "paddling_left" | "paddling_right" | "block_breaking_delay_enabled" | "horizontal_collision" | "vertical_collision" | "down_left" | "down_right" | "start_using_item" | "camera_relative_movement_enabled" | "rot_controlled_by_move_direction" | "start_spin_attack" | "stop_spin_attack" | "hotbar_only_touch" | "jump_released_raw" | "jump_pressed_raw" | "jump_current_raw" | "sneak_released_raw" | "sneak_pressed_raw" | "sneak_current_raw" | "internal_update" | number;
	/**
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type SubChunkEntry = {
		dx: number;
		dy: number;
		dz: number;
		result: "undefined" | "success" | "chunk_not_found" | "invalid_dimension" | "player_not_found" | "y_index_out_of_bounds" | "success_all_air" | number;
		payload?: ByteArray | undefined;
		heightmap_type: HeightMapDataType;
		heightmap?: Buffer | HeightMap | undefined;
		render_heightmap_type: HeightMapDataType;
		render_heightmap?: Buffer | HeightMap | undefined;
		blob_id?: Int64 | undefined;
	}[];
	/**
	 * Added in 1.26.50: sub chunk height maps are sent as 16 rows of 16 heights, each row length-prefixed.
	 * Versions: 1.26.51 – 1.26.60
	 */
	export type HeightMap = number[][];
	/**
	 * Added in 1.26.50: the options a player selected in a furnace-like container UI.
	 * Versions: 1.26.51 – 1.26.60
	 */
	export type FurnaceOptions = {
		/** Versions: 1.26.51 – 1.26.60 */
		left_furnace_tab: number;
		/** Versions: 1.26.51 – 1.26.60 */
		filtering: boolean;
		/** Versions: 1.26.51 – 1.26.60 */
		layout: number;
	};
	/**
	 * Sent by both sides to update the tabs, filtering and layout a player selected in a furnace-like container UI.
	 * Versions: 1.26.51 – 1.26.60
	 */
	export type packet_set_player_furnace_options = {
		/** Versions: 1.26.51 – 1.26.60 */
		furnace_type: "none" | "furnace" | "blast_furnace" | "smoker" | number;
		/** Versions: 1.26.51 – 1.26.60 */
		furnace_options: FurnaceOptions;
	};
	/**
	 * Sent by the server when a record starts playing at a block, such as a music disc inserted into a jukebox.
	 * The handle can be used with clientbound_update_sound_data afterwards.
	 * Versions: 1.26.51 – 1.26.60
	 */
	export type packet_record_started = {
		/** Versions: 1.26.51 – 1.26.60 */
		position: BlockCoordinates;
		/** Versions: 1.26.51 – 1.26.60 */
		handle: Int64;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type PassengerOfBlockData = {
		/** Versions: 1.26.60 */
		block_position: BlockCoordinates;
		/** Versions: 1.26.60 */
		offset: vec3f;
		/** Versions: 1.26.60 */
		rotation: number;
		/** Versions: 1.26.60 */
		rotation_limit: number;
		/** Versions: 1.26.60 */
		emote_type: "standing" | "riding" | "laying" | number;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_clientbound_matchmaking_state = {
		/** Versions: 1.26.60 */
		state: "idle" | "matchmaking" | "match_found" | "canceled" | "player_left_party" | "player_left_server" | "server_shutdown" | "timed_out" | "requeue_as_party" | number;
		/** Versions: 1.26.60 */
		destination_name: string;
		/** Versions: 1.26.60 */
		options?: {
			triggering_player_name?: string | undefined;
			triggered_by_local_player?: boolean | undefined;
		} | undefined;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_serverbound_stonecutter_set_recipe = {
		/** Versions: 1.26.60 */
		container_id: number;
		/** Versions: 1.26.60 */
		recipe_index: number;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_clientbound_stonecutter_set_recipe = {
		/** Versions: 1.26.60 */
		player_unique_id: bigint;
		/** Versions: 1.26.60 */
		container_id: number;
		/** Versions: 1.26.60 */
		recipe_index: number;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_serverbound_matchmaking_cancel = Record<string, never>;
	/**
	 * Versions: 1.26.60
	 */
	export type packet_set_passenger_of_block = {
		/** Versions: 1.26.60 */
		entity_unique_id: bigint;
		/** Versions: 1.26.60 */
		data?: PassengerOfBlockData | undefined;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_serverbound_cursor_item_drag = {
		/** Versions: 1.26.60 */
		state: "start" | "stop" | number;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_clientbound_play_audio_content = {
		/** Versions: 1.26.60 */
		shared_metadata: string;
		/** Versions: 1.26.60 */
		playback_content: string;
		/** Versions: 1.26.60 */
		playback_type: string;
		/** Versions: 1.26.60 */
		name: string;
		/** Versions: 1.26.60 */
		coordinates: BlockCoordinates;
		/** Versions: 1.26.60 */
		volume: number;
		/** Versions: 1.26.60 */
		pitch: number;
		/** Versions: 1.26.60 */
		loop_count: number;
		/** Versions: 1.26.60 */
		bypass_listener_range_check: boolean;
		/** Versions: 1.26.60 */
		handle?: Int64 | undefined;
		/** Versions: 1.26.60 */
		playback_position_seconds?: number | undefined;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_serverbound_register_audio_content = {
		/** Versions: 1.26.60 */
		registrations: {
			audio_content_id: string;
			shared_metadata: string;
			server_content: string;
			playback_content: string;
		}[];
	};
}

export namespace MCProtocol.Bedrock.Read.Clientbound {
	export interface Packets {
		add_behavior_tree: MCProtocol.Bedrock.Read.Types.packet_add_behavior_tree;
		/** Versions: 1.16.201 – 1.20.50 */
		add_ecs_entity: MCProtocol.Bedrock.Read.Types.packet_add_ecs_entity;
		add_entity: MCProtocol.Bedrock.Read.Types.packet_add_entity;
		add_item_entity: MCProtocol.Bedrock.Read.Types.packet_add_item_entity;
		add_painting: MCProtocol.Bedrock.Read.Types.packet_add_painting;
		add_player: MCProtocol.Bedrock.Read.Types.packet_add_player;
		/** Versions: 1.17.0 – 1.26.60 */
		add_volume_entity: MCProtocol.Bedrock.Read.Types.packet_add_volume_entity;
		adventure_settings: MCProtocol.Bedrock.Read.Types.packet_adventure_settings;
		/** Versions: 1.18.30 – 1.26.60 */
		agent_action: MCProtocol.Bedrock.Read.Types.packet_agent_action;
		/** Versions: 1.20.10 – 1.26.60 */
		agent_animation: MCProtocol.Bedrock.Read.Types.packet_agent_animation;
		animate: MCProtocol.Bedrock.Read.Types.packet_animate;
		animate_entity: MCProtocol.Bedrock.Read.Types.packet_animate_entity;
		anvil_damage: MCProtocol.Bedrock.Read.Types.packet_anvil_damage;
		available_commands: MCProtocol.Bedrock.Read.Types.packet_available_commands;
		available_entity_identifiers: MCProtocol.Bedrock.Read.Types.packet_available_entity_identifiers;
		/** Versions: 1.21.0 – 1.26.60 */
		award_achievement: MCProtocol.Bedrock.Read.Types.packet_award_achievement;
		biome_definition_list: MCProtocol.Bedrock.Read.Types.packet_biome_definition_list;
		block_entity_data: MCProtocol.Bedrock.Read.Types.packet_block_entity_data;
		block_event: MCProtocol.Bedrock.Read.Types.packet_block_event;
		block_pick_request: MCProtocol.Bedrock.Read.Types.packet_block_pick_request;
		book_edit: MCProtocol.Bedrock.Read.Types.packet_book_edit;
		boss_event: MCProtocol.Bedrock.Read.Types.packet_boss_event;
		camera: MCProtocol.Bedrock.Read.Types.packet_camera;
		/** Versions: 1.21.30 – 1.26.60 */
		camera_aim_assist: MCProtocol.Bedrock.Read.Types.packet_camera_aim_assist;
		/** Versions: 1.26.0 – 1.26.60 */
		camera_aim_assist_actor_priority: MCProtocol.Bedrock.Read.Types.packet_camera_aim_assist_actor_priority;
		/** Versions: 1.21.50 – 1.26.60 */
		camera_aim_assist_presets: MCProtocol.Bedrock.Read.Types.packet_camera_aim_assist_presets;
		/** Versions: 1.19.70 – 1.26.60 */
		camera_instruction: MCProtocol.Bedrock.Read.Types.packet_camera_instruction;
		/** Versions: 1.19.70 – 1.26.60 */
		camera_presets: MCProtocol.Bedrock.Read.Types.packet_camera_presets;
		camera_shake: MCProtocol.Bedrock.Read.Types.packet_camera_shake;
		/** Versions: 1.26.0 – 1.26.60 */
		camera_spline: MCProtocol.Bedrock.Read.Types.packet_camera_spline;
		change_dimension: MCProtocol.Bedrock.Read.Types.packet_change_dimension;
		/** Versions: 1.18.30 – 1.26.60 */
		change_mob_property: MCProtocol.Bedrock.Read.Types.packet_change_mob_property;
		chunk_radius_update: MCProtocol.Bedrock.Read.Types.packet_chunk_radius_update;
		client_cache_blob_status: MCProtocol.Bedrock.Read.Types.packet_client_cache_blob_status;
		client_cache_miss_response: MCProtocol.Bedrock.Read.Types.packet_client_cache_miss_response;
		client_cache_status: MCProtocol.Bedrock.Read.Types.packet_client_cache_status;
		/** Versions: 1.21.60 – 1.26.60 */
		client_camera_aim_assist: MCProtocol.Bedrock.Read.Types.packet_client_camera_aim_assist;
		/** Versions: 1.19.60 – 1.26.60 */
		client_cheat_ability: MCProtocol.Bedrock.Read.Types.packet_client_cheat_ability;
		/** Versions: 1.21.60 – 1.26.60 */
		client_movement_prediction_sync: MCProtocol.Bedrock.Read.Types.packet_client_movement_prediction_sync;
		/** Versions: 1.18.11 – 1.26.60 */
		client_start_item_cooldown: MCProtocol.Bedrock.Read.Types.packet_client_start_item_cooldown;
		client_to_server_handshake: MCProtocol.Bedrock.Read.Types.packet_client_to_server_handshake;
		/** Versions: 1.26.10 – 1.26.60 */
		clientbound_attribute_layer_sync: MCProtocol.Bedrock.Read.Types.packet_clientbound_attribute_layer_sync;
		/** Versions: 1.21.2 – 1.26.60 */
		clientbound_close_form: MCProtocol.Bedrock.Read.Types.packet_clientbound_close_form;
		/** Versions: 1.21.80 – 1.26.60 */
		clientbound_controls_scheme: MCProtocol.Bedrock.Read.Types.packet_clientbound_controls_scheme;
		/** Versions: 1.26.0 */
		clientbound_data_driven_ui_close_all_screens: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_driven_ui_close_all_screens;
		/** Versions: 1.26.10 – 1.26.60 */
		clientbound_data_driven_ui_close_screen: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_driven_ui_close_screen;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_data_driven_ui_reload: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_driven_ui_reload;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_data_driven_ui_show_screen: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_driven_ui_show_screen;
		/** Versions: 1.21.130 – 1.26.60 */
		clientbound_data_store: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_store;
		clientbound_map_item_data: MCProtocol.Bedrock.Read.Types.packet_clientbound_map_item_data;
		/** Versions: 1.26.60 */
		clientbound_matchmaking_state: MCProtocol.Bedrock.Read.Types.packet_clientbound_matchmaking_state;
		/** Versions: 1.26.60 */
		clientbound_play_audio_content: MCProtocol.Bedrock.Read.Types.packet_clientbound_play_audio_content;
		/** Versions: 1.26.60 */
		clientbound_stonecutter_set_recipe: MCProtocol.Bedrock.Read.Types.packet_clientbound_stonecutter_set_recipe;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_texture_shift: MCProtocol.Bedrock.Read.Types.packet_clientbound_texture_shift;
		/** Versions: 1.26.30 – 1.26.60 */
		clientbound_update_sound_data: MCProtocol.Bedrock.Read.Types.packet_clientbound_update_sound_data;
		code_builder: MCProtocol.Bedrock.Read.Types.packet_code_builder;
		/** Versions: 1.18.11 – 1.26.60 */
		code_builder_source: MCProtocol.Bedrock.Read.Types.packet_code_builder_source;
		command_block_update: MCProtocol.Bedrock.Read.Types.packet_command_block_update;
		command_output: MCProtocol.Bedrock.Read.Types.packet_command_output;
		command_request: MCProtocol.Bedrock.Read.Types.packet_command_request;
		completed_using_item: MCProtocol.Bedrock.Read.Types.packet_completed_using_item;
		/** Versions: 1.19.80 – 1.26.60 */
		compressed_biome_definitions: MCProtocol.Bedrock.Read.Types.packet_compressed_biome_definitions;
		container_close: MCProtocol.Bedrock.Read.Types.packet_container_close;
		container_open: MCProtocol.Bedrock.Read.Types.packet_container_open;
		/** Versions: 1.21.30 – 1.26.60 */
		container_registry_cleanup: MCProtocol.Bedrock.Read.Types.packet_container_registry_cleanup;
		container_set_data: MCProtocol.Bedrock.Read.Types.packet_container_set_data;
		correct_player_move_prediction: MCProtocol.Bedrock.Read.Types.packet_correct_player_move_prediction;
		crafting_data: MCProtocol.Bedrock.Read.Types.packet_crafting_data;
		crafting_event: MCProtocol.Bedrock.Read.Types.packet_crafting_event;
		/** Versions: 1.17.30 – 1.26.60 */
		create_photo: MCProtocol.Bedrock.Read.Types.packet_create_photo;
		creative_content: MCProtocol.Bedrock.Read.Types.packet_creative_content;
		/** Versions: 1.21.20 – 1.26.60 */
		current_structure_feature: MCProtocol.Bedrock.Read.Types.packet_current_structure_feature;
		/** Versions: 1.19.10 – 1.26.60 */
		death_info: MCProtocol.Bedrock.Read.Types.packet_death_info;
		debug_info: MCProtocol.Bedrock.Read.Types.packet_debug_info;
		/** Versions: 1.16.210 – 1.26.10 */
		debug_renderer: MCProtocol.Bedrock.Read.Types.packet_debug_renderer;
		/** Versions: 1.18.30 – 1.26.60 */
		dimension_data: MCProtocol.Bedrock.Read.Types.packet_dimension_data;
		disconnect: MCProtocol.Bedrock.Read.Types.packet_disconnect;
		/** Versions: 1.19.10 – 1.26.60 */
		editor_network: MCProtocol.Bedrock.Read.Types.packet_editor_network;
		/** Versions: 1.17.30 – 1.26.60 */
		edu_uri_resource_packet: MCProtocol.Bedrock.Read.Types.packet_edu_uri_resource_packet;
		education_settings: MCProtocol.Bedrock.Read.Types.packet_education_settings;
		emote: MCProtocol.Bedrock.Read.Types.packet_emote;
		emote_list: MCProtocol.Bedrock.Read.Types.packet_emote_list;
		entity_event: MCProtocol.Bedrock.Read.Types.packet_entity_event;
		entity_pick_request: MCProtocol.Bedrock.Read.Types.packet_entity_pick_request;
		event: MCProtocol.Bedrock.Read.Types.packet_event;
		/** Versions: 1.19.20 – 1.26.60 */
		feature_registry: MCProtocol.Bedrock.Read.Types.packet_feature_registry;
		filter_text_packet: MCProtocol.Bedrock.Read.Types.packet_filter_text_packet;
		game_rules_changed: MCProtocol.Bedrock.Read.Types.packet_game_rules_changed;
		/** Versions: 1.19.30 – 1.26.60 */
		game_test_request: MCProtocol.Bedrock.Read.Types.packet_game_test_request;
		/** Versions: 1.19.30 – 1.26.60 */
		game_test_results: MCProtocol.Bedrock.Read.Types.packet_game_test_results;
		/** Versions: 1.21.120 – 1.26.60 */
		graphics_override_parameter: MCProtocol.Bedrock.Read.Types.packet_graphics_override_parameter;
		gui_data_pick_item: MCProtocol.Bedrock.Read.Types.packet_gui_data_pick_item;
		hurt_armor: MCProtocol.Bedrock.Read.Types.packet_hurt_armor;
		initiate_web_socket_connection: MCProtocol.Bedrock.Read.Types.packet_initiate_web_socket_connection;
		interact: MCProtocol.Bedrock.Read.Types.packet_interact;
		inventory_content: MCProtocol.Bedrock.Read.Types.packet_inventory_content;
		inventory_slot: MCProtocol.Bedrock.Read.Types.packet_inventory_slot;
		inventory_transaction: MCProtocol.Bedrock.Read.Types.packet_inventory_transaction;
		/** Versions: 1.16.201 – 1.21.50 */
		item_component: MCProtocol.Bedrock.Read.Types.packet_item_component;
		/** Versions: 1.16.201 – 1.20.61 */
		item_frame_drop_item: MCProtocol.Bedrock.Read.Types.packet_item_frame_drop_item;
		/** Versions: 1.21.60 – 1.26.60 */
		item_registry: MCProtocol.Bedrock.Read.Types.packet_item_registry;
		item_stack_request: MCProtocol.Bedrock.Read.Types.packet_item_stack_request;
		item_stack_response: MCProtocol.Bedrock.Read.Types.packet_item_stack_response;
		/** Versions: 1.21.20 – 1.26.60 */
		jigsaw_structure_data: MCProtocol.Bedrock.Read.Types.packet_jigsaw_structure_data;
		lab_table: MCProtocol.Bedrock.Read.Types.packet_lab_table;
		lectern_update: MCProtocol.Bedrock.Read.Types.packet_lectern_update;
		/** Versions: 1.19.1 – 1.26.60 */
		lesson_progress: MCProtocol.Bedrock.Read.Types.packet_lesson_progress;
		level_chunk: MCProtocol.Bedrock.Read.Types.packet_level_chunk;
		level_event: MCProtocol.Bedrock.Read.Types.packet_level_event;
		level_event_generic: MCProtocol.Bedrock.Read.Types.packet_level_event_generic;
		level_sound_event: MCProtocol.Bedrock.Read.Types.packet_level_sound_event;
		level_sound_event_old: MCProtocol.Bedrock.Read.Types.packet_level_sound_event_old;
		level_sound_event_v2: MCProtocol.Bedrock.Read.Types.packet_level_sound_event_v2;
		/** Versions: 1.26.10 – 1.26.60 */
		locator_bar: MCProtocol.Bedrock.Read.Types.packet_locator_bar;
		login: MCProtocol.Bedrock.Read.Types.packet_login;
		map_create_locked_copy: MCProtocol.Bedrock.Read.Types.packet_map_create_locked_copy;
		map_info_request: MCProtocol.Bedrock.Read.Types.packet_map_info_request;
		mob_armor_equipment: MCProtocol.Bedrock.Read.Types.packet_mob_armor_equipment;
		mob_effect: MCProtocol.Bedrock.Read.Types.packet_mob_effect;
		mob_equipment: MCProtocol.Bedrock.Read.Types.packet_mob_equipment;
		modal_form_request: MCProtocol.Bedrock.Read.Types.packet_modal_form_request;
		modal_form_response: MCProtocol.Bedrock.Read.Types.packet_modal_form_response;
		motion_prediction_hints: MCProtocol.Bedrock.Read.Types.packet_motion_prediction_hints;
		move_entity: MCProtocol.Bedrock.Read.Types.packet_move_entity;
		move_entity_delta: MCProtocol.Bedrock.Read.Types.packet_move_entity_delta;
		move_player: MCProtocol.Bedrock.Read.Types.packet_move_player;
		/** Versions: 1.21.42 – 1.26.60 */
		movement_effect: MCProtocol.Bedrock.Read.Types.packet_movement_effect;
		multiplayer_settings: MCProtocol.Bedrock.Read.Types.packet_multiplayer_settings;
		network_chunk_publisher_update: MCProtocol.Bedrock.Read.Types.packet_network_chunk_publisher_update;
		network_settings: MCProtocol.Bedrock.Read.Types.packet_network_settings;
		network_stack_latency: MCProtocol.Bedrock.Read.Types.packet_network_stack_latency;
		/** Versions: 1.17.10 – 1.26.60 */
		npc_dialogue: MCProtocol.Bedrock.Read.Types.packet_npc_dialogue;
		npc_request: MCProtocol.Bedrock.Read.Types.packet_npc_request;
		on_screen_texture_animation: MCProtocol.Bedrock.Read.Types.packet_on_screen_texture_animation;
		/** Versions: 1.19.80 – 1.26.60 */
		open_sign: MCProtocol.Bedrock.Read.Types.packet_open_sign;
		packet_violation_warning: MCProtocol.Bedrock.Read.Types.packet_packet_violation_warning;
		/** Versions: 1.26.10 – 1.26.60 */
		party_changed: MCProtocol.Bedrock.Read.Types.packet_party_changed;
		/** Versions: 1.26.30 – 1.26.60 */
		party_destination_cookie_response: MCProtocol.Bedrock.Read.Types.packet_party_destination_cookie_response;
		/** Versions: 1.17.30 – 1.26.60 */
		photo_info_request: MCProtocol.Bedrock.Read.Types.packet_photo_info_request;
		photo_transfer: MCProtocol.Bedrock.Read.Types.packet_photo_transfer;
		play_sound: MCProtocol.Bedrock.Read.Types.packet_play_sound;
		play_status: MCProtocol.Bedrock.Read.Types.packet_play_status;
		player_action: MCProtocol.Bedrock.Read.Types.packet_player_action;
		player_armor_damage: MCProtocol.Bedrock.Read.Types.packet_player_armor_damage;
		player_auth_input: MCProtocol.Bedrock.Read.Types.packet_player_auth_input;
		player_enchant_options: MCProtocol.Bedrock.Read.Types.packet_player_enchant_options;
		player_fog: MCProtocol.Bedrock.Read.Types.packet_player_fog;
		player_hotbar: MCProtocol.Bedrock.Read.Types.packet_player_hotbar;
		player_input: MCProtocol.Bedrock.Read.Types.packet_player_input;
		player_list: MCProtocol.Bedrock.Read.Types.packet_player_list;
		/** Versions: 1.21.80 – 1.26.60 */
		player_location: MCProtocol.Bedrock.Read.Types.packet_player_location;
		player_skin: MCProtocol.Bedrock.Read.Types.packet_player_skin;
		/** Versions: 1.21.70 – 1.26.60 */
		player_update_entity_overrides: MCProtocol.Bedrock.Read.Types.packet_player_update_entity_overrides;
		/** Versions: 1.21.70 – 1.26.60 */
		player_video_capture: MCProtocol.Bedrock.Read.Types.packet_player_video_capture;
		position_tracking_db_broadcast: MCProtocol.Bedrock.Read.Types.packet_position_tracking_db_broadcast;
		position_tracking_db_request: MCProtocol.Bedrock.Read.Types.packet_position_tracking_db_request;
		/** Versions: 1.26.20 – 1.26.60 */
		primitive_shapes: MCProtocol.Bedrock.Read.Types.packet_primitive_shapes;
		purchase_receipt: MCProtocol.Bedrock.Read.Types.packet_purchase_receipt;
		/** Versions: 1.26.51 – 1.26.60 */
		record_started: MCProtocol.Bedrock.Read.Types.packet_record_started;
		/** Versions: 1.20.30 – 1.26.60 */
		refresh_entitlements: MCProtocol.Bedrock.Read.Types.packet_refresh_entitlements;
		/** Versions: 1.16.201 – 1.20.50 */
		remove_ecs_entity: MCProtocol.Bedrock.Read.Types.packet_remove_ecs_entity;
		remove_entity: MCProtocol.Bedrock.Read.Types.packet_remove_entity;
		remove_objective: MCProtocol.Bedrock.Read.Types.packet_remove_objective;
		/** Versions: 1.17.0 – 1.26.60 */
		remove_volume_entity: MCProtocol.Bedrock.Read.Types.packet_remove_volume_entity;
		/** Versions: 1.19.1 – 1.26.60 */
		request_ability: MCProtocol.Bedrock.Read.Types.packet_request_ability;
		request_chunk_radius: MCProtocol.Bedrock.Read.Types.packet_request_chunk_radius;
		/** Versions: 1.19.30 – 1.26.60 */
		request_network_settings: MCProtocol.Bedrock.Read.Types.packet_request_network_settings;
		/** Versions: 1.19.1 – 1.26.60 */
		request_permissions: MCProtocol.Bedrock.Read.Types.packet_request_permissions;
		resource_pack_chunk_data: MCProtocol.Bedrock.Read.Types.packet_resource_pack_chunk_data;
		resource_pack_chunk_request: MCProtocol.Bedrock.Read.Types.packet_resource_pack_chunk_request;
		resource_pack_client_response: MCProtocol.Bedrock.Read.Types.packet_resource_pack_client_response;
		resource_pack_data_info: MCProtocol.Bedrock.Read.Types.packet_resource_pack_data_info;
		resource_pack_stack: MCProtocol.Bedrock.Read.Types.packet_resource_pack_stack;
		resource_packs_info: MCProtocol.Bedrock.Read.Types.packet_resource_packs_info;
		/** Versions: 1.26.10 – 1.26.60 */
		resource_packs_ready_for_validation: MCProtocol.Bedrock.Read.Types.packet_resource_packs_ready_for_validation;
		respawn: MCProtocol.Bedrock.Read.Types.packet_respawn;
		rider_jump: MCProtocol.Bedrock.Read.Types.packet_rider_jump;
		script_custom_event: MCProtocol.Bedrock.Read.Types.packet_script_custom_event;
		/** Versions: 1.18.11 – 1.26.60 */
		script_message: MCProtocol.Bedrock.Read.Types.packet_script_message;
		/** Versions: 1.26.30 – 1.26.60 */
		send_party_destination_cookie: MCProtocol.Bedrock.Read.Types.packet_send_party_destination_cookie;
		/** Versions: 1.20.50 – 1.26.60 */
		server_post_move: MCProtocol.Bedrock.Read.Types.packet_server_post_move;
		/** Versions: 1.26.20 – 1.26.60 */
		server_presence_info: MCProtocol.Bedrock.Read.Types.packet_server_presence_info;
		/** Versions: 1.21.90 – 1.26.60 */
		server_script_debug_drawer: MCProtocol.Bedrock.Read.Types.packet_server_script_debug_drawer;
		server_settings_request: MCProtocol.Bedrock.Read.Types.packet_server_settings_request;
		server_settings_response: MCProtocol.Bedrock.Read.Types.packet_server_settings_response;
		/** Versions: 1.19.30 – 1.26.60 */
		server_stats: MCProtocol.Bedrock.Read.Types.packet_server_stats;
		/** Versions: 1.26.20 – 1.26.60 */
		server_store_info: MCProtocol.Bedrock.Read.Types.packet_server_store_info;
		server_to_client_handshake: MCProtocol.Bedrock.Read.Types.packet_server_to_client_handshake;
		/** Versions: 1.26.60 */
		serverbound_cursor_item_drag: MCProtocol.Bedrock.Read.Types.packet_serverbound_cursor_item_drag;
		/** Versions: 1.26.10 – 1.26.60 */
		serverbound_data_driven_screen_closed: MCProtocol.Bedrock.Read.Types.packet_serverbound_data_driven_screen_closed;
		/** Versions: 1.21.130 – 1.26.60 */
		serverbound_data_store: MCProtocol.Bedrock.Read.Types.packet_serverbound_data_store;
		/** Versions: 1.21.20 – 1.26.60 */
		serverbound_diagnostics: MCProtocol.Bedrock.Read.Types.packet_serverbound_diagnostics;
		/** Versions: 1.21.20 – 1.26.60 */
		serverbound_loading_screen: MCProtocol.Bedrock.Read.Types.packet_serverbound_loading_screen;
		/** Versions: 1.26.60 */
		serverbound_matchmaking_cancel: MCProtocol.Bedrock.Read.Types.packet_serverbound_matchmaking_cancel;
		/** Versions: 1.21.111 – 1.26.60 */
		serverbound_pack_setting_change: MCProtocol.Bedrock.Read.Types.packet_serverbound_pack_setting_change;
		/** Versions: 1.26.60 */
		serverbound_register_audio_content: MCProtocol.Bedrock.Read.Types.packet_serverbound_register_audio_content;
		/** Versions: 1.26.60 */
		serverbound_stonecutter_set_recipe: MCProtocol.Bedrock.Read.Types.packet_serverbound_stonecutter_set_recipe;
		set_commands_enabled: MCProtocol.Bedrock.Read.Types.packet_set_commands_enabled;
		set_default_game_type: MCProtocol.Bedrock.Read.Types.packet_set_default_game_type;
		set_difficulty: MCProtocol.Bedrock.Read.Types.packet_set_difficulty;
		set_display_objective: MCProtocol.Bedrock.Read.Types.packet_set_display_objective;
		set_entity_data: MCProtocol.Bedrock.Read.Types.packet_set_entity_data;
		set_entity_link: MCProtocol.Bedrock.Read.Types.packet_set_entity_link;
		set_entity_motion: MCProtocol.Bedrock.Read.Types.packet_set_entity_motion;
		set_health: MCProtocol.Bedrock.Read.Types.packet_set_health;
		/** Versions: 1.20.61 – 1.26.60 */
		set_hud: MCProtocol.Bedrock.Read.Types.packet_set_hud;
		set_last_hurt_by: MCProtocol.Bedrock.Read.Types.packet_set_last_hurt_by;
		set_local_player_as_initialized: MCProtocol.Bedrock.Read.Types.packet_set_local_player_as_initialized;
		/** Versions: 1.21.42 – 1.26.60 */
		set_movement_authority: MCProtocol.Bedrock.Read.Types.packet_set_movement_authority;
		/** Versions: 1.26.60 */
		set_passenger_of_block: MCProtocol.Bedrock.Read.Types.packet_set_passenger_of_block;
		/** Versions: 1.26.51 – 1.26.60 */
		set_player_furnace_options: MCProtocol.Bedrock.Read.Types.packet_set_player_furnace_options;
		set_player_game_type: MCProtocol.Bedrock.Read.Types.packet_set_player_game_type;
		/** Versions: 1.20.50 – 1.26.60 */
		set_player_inventory_options: MCProtocol.Bedrock.Read.Types.packet_set_player_inventory_options;
		set_score: MCProtocol.Bedrock.Read.Types.packet_set_score;
		set_scoreboard_identity: MCProtocol.Bedrock.Read.Types.packet_set_scoreboard_identity;
		set_spawn_position: MCProtocol.Bedrock.Read.Types.packet_set_spawn_position;
		set_time: MCProtocol.Bedrock.Read.Types.packet_set_time;
		set_title: MCProtocol.Bedrock.Read.Types.packet_set_title;
		settings_command: MCProtocol.Bedrock.Read.Types.packet_settings_command;
		show_credits: MCProtocol.Bedrock.Read.Types.packet_show_credits;
		show_profile: MCProtocol.Bedrock.Read.Types.packet_show_profile;
		show_store_offer: MCProtocol.Bedrock.Read.Types.packet_show_store_offer;
		simple_event: MCProtocol.Bedrock.Read.Types.packet_simple_event;
		/** Versions: 1.17.10 – 1.26.60 */
		simulation_type: MCProtocol.Bedrock.Read.Types.packet_simulation_type;
		spawn_experience_orb: MCProtocol.Bedrock.Read.Types.packet_spawn_experience_orb;
		spawn_particle_effect: MCProtocol.Bedrock.Read.Types.packet_spawn_particle_effect;
		start_game: MCProtocol.Bedrock.Read.Types.packet_start_game;
		stop_sound: MCProtocol.Bedrock.Read.Types.packet_stop_sound;
		structure_block_update: MCProtocol.Bedrock.Read.Types.packet_structure_block_update;
		structure_template_data_export_request: MCProtocol.Bedrock.Read.Types.packet_structure_template_data_export_request;
		structure_template_data_export_response: MCProtocol.Bedrock.Read.Types.packet_structure_template_data_export_response;
		sub_client_login: MCProtocol.Bedrock.Read.Types.packet_sub_client_login;
		/** Versions: 1.17.40 – 1.26.60 */
		subchunk: MCProtocol.Bedrock.Read.Types.packet_subchunk;
		/** Versions: 1.17.40 – 1.26.60 */
		subchunk_request: MCProtocol.Bedrock.Read.Types.packet_subchunk_request;
		/** Versions: 1.17.0 – 1.26.60 */
		sync_entity_property: MCProtocol.Bedrock.Read.Types.packet_sync_entity_property;
		/** Versions: 1.26.10 – 1.26.60 */
		sync_world_clocks: MCProtocol.Bedrock.Read.Types.packet_sync_world_clocks;
		take_item_entity: MCProtocol.Bedrock.Read.Types.packet_take_item_entity;
		text: MCProtocol.Bedrock.Read.Types.packet_text;
		tick_sync: MCProtocol.Bedrock.Read.Types.packet_tick_sync;
		/** Versions: 1.18.30 – 1.26.60 */
		ticking_areas_load_status: MCProtocol.Bedrock.Read.Types.packet_ticking_areas_load_status;
		/** Versions: 1.19.1 – 1.26.60 */
		toast_request: MCProtocol.Bedrock.Read.Types.packet_toast_request;
		/** Versions: 1.20.50 – 1.26.60 */
		toggle_crafter_slot_request: MCProtocol.Bedrock.Read.Types.packet_toggle_crafter_slot_request;
		transfer: MCProtocol.Bedrock.Read.Types.packet_transfer;
		/** Versions: 1.19.80 – 1.26.60 */
		trim_data: MCProtocol.Bedrock.Read.Types.packet_trim_data;
		/** Versions: 1.19.70 – 1.26.60 */
		unlocked_recipes: MCProtocol.Bedrock.Read.Types.packet_unlocked_recipes;
		/** Versions: 1.19.10 – 1.26.60 */
		update_abilities: MCProtocol.Bedrock.Read.Types.packet_update_abilities;
		/** Versions: 1.19.10 – 1.26.60 */
		update_adventure_settings: MCProtocol.Bedrock.Read.Types.packet_update_adventure_settings;
		update_attributes: MCProtocol.Bedrock.Read.Types.packet_update_attributes;
		update_block: MCProtocol.Bedrock.Read.Types.packet_update_block;
		update_block_properties: MCProtocol.Bedrock.Read.Types.packet_update_block_properties;
		update_block_synced: MCProtocol.Bedrock.Read.Types.packet_update_block_synced;
		/** Versions: 1.19.50 – 1.26.60 */
		update_client_input_locks: MCProtocol.Bedrock.Read.Types.packet_update_client_input_locks;
		/** Versions: 1.21.70 – 1.26.60 */
		update_client_options: MCProtocol.Bedrock.Read.Types.packet_update_client_options;
		update_equipment: MCProtocol.Bedrock.Read.Types.packet_update_equipment;
		update_player_game_type: MCProtocol.Bedrock.Read.Types.packet_update_player_game_type;
		update_soft_enum: MCProtocol.Bedrock.Read.Types.packet_update_soft_enum;
		/** Versions: 1.17.30 – 1.26.60 */
		update_subchunk_blocks: MCProtocol.Bedrock.Read.Types.packet_update_subchunk_blocks;
		update_trade: MCProtocol.Bedrock.Read.Types.packet_update_trade;
		video_stream_connect: MCProtocol.Bedrock.Read.Types.packet_video_stream_connect;
		/** Versions: 1.26.0 – 1.26.60 */
		voxel_shapes: MCProtocol.Bedrock.Read.Types.packet_voxel_shapes;
	}
}

export namespace MCProtocol.Bedrock.Read.Serverbound {
	export interface Packets {
		add_behavior_tree: MCProtocol.Bedrock.Read.Types.packet_add_behavior_tree;
		/** Versions: 1.16.201 – 1.20.50 */
		add_ecs_entity: MCProtocol.Bedrock.Read.Types.packet_add_ecs_entity;
		add_entity: MCProtocol.Bedrock.Read.Types.packet_add_entity;
		add_item_entity: MCProtocol.Bedrock.Read.Types.packet_add_item_entity;
		add_painting: MCProtocol.Bedrock.Read.Types.packet_add_painting;
		add_player: MCProtocol.Bedrock.Read.Types.packet_add_player;
		/** Versions: 1.17.0 – 1.26.60 */
		add_volume_entity: MCProtocol.Bedrock.Read.Types.packet_add_volume_entity;
		adventure_settings: MCProtocol.Bedrock.Read.Types.packet_adventure_settings;
		/** Versions: 1.18.30 – 1.26.60 */
		agent_action: MCProtocol.Bedrock.Read.Types.packet_agent_action;
		/** Versions: 1.20.10 – 1.26.60 */
		agent_animation: MCProtocol.Bedrock.Read.Types.packet_agent_animation;
		animate: MCProtocol.Bedrock.Read.Types.packet_animate;
		animate_entity: MCProtocol.Bedrock.Read.Types.packet_animate_entity;
		anvil_damage: MCProtocol.Bedrock.Read.Types.packet_anvil_damage;
		available_commands: MCProtocol.Bedrock.Read.Types.packet_available_commands;
		available_entity_identifiers: MCProtocol.Bedrock.Read.Types.packet_available_entity_identifiers;
		/** Versions: 1.21.0 – 1.26.60 */
		award_achievement: MCProtocol.Bedrock.Read.Types.packet_award_achievement;
		biome_definition_list: MCProtocol.Bedrock.Read.Types.packet_biome_definition_list;
		block_entity_data: MCProtocol.Bedrock.Read.Types.packet_block_entity_data;
		block_event: MCProtocol.Bedrock.Read.Types.packet_block_event;
		block_pick_request: MCProtocol.Bedrock.Read.Types.packet_block_pick_request;
		book_edit: MCProtocol.Bedrock.Read.Types.packet_book_edit;
		boss_event: MCProtocol.Bedrock.Read.Types.packet_boss_event;
		camera: MCProtocol.Bedrock.Read.Types.packet_camera;
		/** Versions: 1.21.30 – 1.26.60 */
		camera_aim_assist: MCProtocol.Bedrock.Read.Types.packet_camera_aim_assist;
		/** Versions: 1.26.0 – 1.26.60 */
		camera_aim_assist_actor_priority: MCProtocol.Bedrock.Read.Types.packet_camera_aim_assist_actor_priority;
		/** Versions: 1.21.50 – 1.26.60 */
		camera_aim_assist_presets: MCProtocol.Bedrock.Read.Types.packet_camera_aim_assist_presets;
		/** Versions: 1.19.70 – 1.26.60 */
		camera_instruction: MCProtocol.Bedrock.Read.Types.packet_camera_instruction;
		/** Versions: 1.19.70 – 1.26.60 */
		camera_presets: MCProtocol.Bedrock.Read.Types.packet_camera_presets;
		camera_shake: MCProtocol.Bedrock.Read.Types.packet_camera_shake;
		/** Versions: 1.26.0 – 1.26.60 */
		camera_spline: MCProtocol.Bedrock.Read.Types.packet_camera_spline;
		change_dimension: MCProtocol.Bedrock.Read.Types.packet_change_dimension;
		/** Versions: 1.18.30 – 1.26.60 */
		change_mob_property: MCProtocol.Bedrock.Read.Types.packet_change_mob_property;
		chunk_radius_update: MCProtocol.Bedrock.Read.Types.packet_chunk_radius_update;
		client_cache_blob_status: MCProtocol.Bedrock.Read.Types.packet_client_cache_blob_status;
		client_cache_miss_response: MCProtocol.Bedrock.Read.Types.packet_client_cache_miss_response;
		client_cache_status: MCProtocol.Bedrock.Read.Types.packet_client_cache_status;
		/** Versions: 1.21.60 – 1.26.60 */
		client_camera_aim_assist: MCProtocol.Bedrock.Read.Types.packet_client_camera_aim_assist;
		/** Versions: 1.19.60 – 1.26.60 */
		client_cheat_ability: MCProtocol.Bedrock.Read.Types.packet_client_cheat_ability;
		/** Versions: 1.21.60 – 1.26.60 */
		client_movement_prediction_sync: MCProtocol.Bedrock.Read.Types.packet_client_movement_prediction_sync;
		/** Versions: 1.18.11 – 1.26.60 */
		client_start_item_cooldown: MCProtocol.Bedrock.Read.Types.packet_client_start_item_cooldown;
		client_to_server_handshake: MCProtocol.Bedrock.Read.Types.packet_client_to_server_handshake;
		/** Versions: 1.26.10 – 1.26.60 */
		clientbound_attribute_layer_sync: MCProtocol.Bedrock.Read.Types.packet_clientbound_attribute_layer_sync;
		/** Versions: 1.21.2 – 1.26.60 */
		clientbound_close_form: MCProtocol.Bedrock.Read.Types.packet_clientbound_close_form;
		/** Versions: 1.21.80 – 1.26.60 */
		clientbound_controls_scheme: MCProtocol.Bedrock.Read.Types.packet_clientbound_controls_scheme;
		/** Versions: 1.26.0 */
		clientbound_data_driven_ui_close_all_screens: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_driven_ui_close_all_screens;
		/** Versions: 1.26.10 – 1.26.60 */
		clientbound_data_driven_ui_close_screen: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_driven_ui_close_screen;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_data_driven_ui_reload: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_driven_ui_reload;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_data_driven_ui_show_screen: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_driven_ui_show_screen;
		/** Versions: 1.21.130 – 1.26.60 */
		clientbound_data_store: MCProtocol.Bedrock.Read.Types.packet_clientbound_data_store;
		clientbound_map_item_data: MCProtocol.Bedrock.Read.Types.packet_clientbound_map_item_data;
		/** Versions: 1.26.60 */
		clientbound_matchmaking_state: MCProtocol.Bedrock.Read.Types.packet_clientbound_matchmaking_state;
		/** Versions: 1.26.60 */
		clientbound_play_audio_content: MCProtocol.Bedrock.Read.Types.packet_clientbound_play_audio_content;
		/** Versions: 1.26.60 */
		clientbound_stonecutter_set_recipe: MCProtocol.Bedrock.Read.Types.packet_clientbound_stonecutter_set_recipe;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_texture_shift: MCProtocol.Bedrock.Read.Types.packet_clientbound_texture_shift;
		/** Versions: 1.26.30 – 1.26.60 */
		clientbound_update_sound_data: MCProtocol.Bedrock.Read.Types.packet_clientbound_update_sound_data;
		code_builder: MCProtocol.Bedrock.Read.Types.packet_code_builder;
		/** Versions: 1.18.11 – 1.26.60 */
		code_builder_source: MCProtocol.Bedrock.Read.Types.packet_code_builder_source;
		command_block_update: MCProtocol.Bedrock.Read.Types.packet_command_block_update;
		command_output: MCProtocol.Bedrock.Read.Types.packet_command_output;
		command_request: MCProtocol.Bedrock.Read.Types.packet_command_request;
		completed_using_item: MCProtocol.Bedrock.Read.Types.packet_completed_using_item;
		/** Versions: 1.19.80 – 1.26.60 */
		compressed_biome_definitions: MCProtocol.Bedrock.Read.Types.packet_compressed_biome_definitions;
		container_close: MCProtocol.Bedrock.Read.Types.packet_container_close;
		container_open: MCProtocol.Bedrock.Read.Types.packet_container_open;
		/** Versions: 1.21.30 – 1.26.60 */
		container_registry_cleanup: MCProtocol.Bedrock.Read.Types.packet_container_registry_cleanup;
		container_set_data: MCProtocol.Bedrock.Read.Types.packet_container_set_data;
		correct_player_move_prediction: MCProtocol.Bedrock.Read.Types.packet_correct_player_move_prediction;
		crafting_data: MCProtocol.Bedrock.Read.Types.packet_crafting_data;
		crafting_event: MCProtocol.Bedrock.Read.Types.packet_crafting_event;
		/** Versions: 1.17.30 – 1.26.60 */
		create_photo: MCProtocol.Bedrock.Read.Types.packet_create_photo;
		creative_content: MCProtocol.Bedrock.Read.Types.packet_creative_content;
		/** Versions: 1.21.20 – 1.26.60 */
		current_structure_feature: MCProtocol.Bedrock.Read.Types.packet_current_structure_feature;
		/** Versions: 1.19.10 – 1.26.60 */
		death_info: MCProtocol.Bedrock.Read.Types.packet_death_info;
		debug_info: MCProtocol.Bedrock.Read.Types.packet_debug_info;
		/** Versions: 1.16.210 – 1.26.10 */
		debug_renderer: MCProtocol.Bedrock.Read.Types.packet_debug_renderer;
		/** Versions: 1.18.30 – 1.26.60 */
		dimension_data: MCProtocol.Bedrock.Read.Types.packet_dimension_data;
		disconnect: MCProtocol.Bedrock.Read.Types.packet_disconnect;
		/** Versions: 1.19.10 – 1.26.60 */
		editor_network: MCProtocol.Bedrock.Read.Types.packet_editor_network;
		/** Versions: 1.17.30 – 1.26.60 */
		edu_uri_resource_packet: MCProtocol.Bedrock.Read.Types.packet_edu_uri_resource_packet;
		education_settings: MCProtocol.Bedrock.Read.Types.packet_education_settings;
		emote: MCProtocol.Bedrock.Read.Types.packet_emote;
		emote_list: MCProtocol.Bedrock.Read.Types.packet_emote_list;
		entity_event: MCProtocol.Bedrock.Read.Types.packet_entity_event;
		entity_pick_request: MCProtocol.Bedrock.Read.Types.packet_entity_pick_request;
		event: MCProtocol.Bedrock.Read.Types.packet_event;
		/** Versions: 1.19.20 – 1.26.60 */
		feature_registry: MCProtocol.Bedrock.Read.Types.packet_feature_registry;
		filter_text_packet: MCProtocol.Bedrock.Read.Types.packet_filter_text_packet;
		game_rules_changed: MCProtocol.Bedrock.Read.Types.packet_game_rules_changed;
		/** Versions: 1.19.30 – 1.26.60 */
		game_test_request: MCProtocol.Bedrock.Read.Types.packet_game_test_request;
		/** Versions: 1.19.30 – 1.26.60 */
		game_test_results: MCProtocol.Bedrock.Read.Types.packet_game_test_results;
		/** Versions: 1.21.120 – 1.26.60 */
		graphics_override_parameter: MCProtocol.Bedrock.Read.Types.packet_graphics_override_parameter;
		gui_data_pick_item: MCProtocol.Bedrock.Read.Types.packet_gui_data_pick_item;
		hurt_armor: MCProtocol.Bedrock.Read.Types.packet_hurt_armor;
		initiate_web_socket_connection: MCProtocol.Bedrock.Read.Types.packet_initiate_web_socket_connection;
		interact: MCProtocol.Bedrock.Read.Types.packet_interact;
		inventory_content: MCProtocol.Bedrock.Read.Types.packet_inventory_content;
		inventory_slot: MCProtocol.Bedrock.Read.Types.packet_inventory_slot;
		inventory_transaction: MCProtocol.Bedrock.Read.Types.packet_inventory_transaction;
		/** Versions: 1.16.201 – 1.21.50 */
		item_component: MCProtocol.Bedrock.Read.Types.packet_item_component;
		/** Versions: 1.16.201 – 1.20.61 */
		item_frame_drop_item: MCProtocol.Bedrock.Read.Types.packet_item_frame_drop_item;
		/** Versions: 1.21.60 – 1.26.60 */
		item_registry: MCProtocol.Bedrock.Read.Types.packet_item_registry;
		item_stack_request: MCProtocol.Bedrock.Read.Types.packet_item_stack_request;
		item_stack_response: MCProtocol.Bedrock.Read.Types.packet_item_stack_response;
		/** Versions: 1.21.20 – 1.26.60 */
		jigsaw_structure_data: MCProtocol.Bedrock.Read.Types.packet_jigsaw_structure_data;
		lab_table: MCProtocol.Bedrock.Read.Types.packet_lab_table;
		lectern_update: MCProtocol.Bedrock.Read.Types.packet_lectern_update;
		/** Versions: 1.19.1 – 1.26.60 */
		lesson_progress: MCProtocol.Bedrock.Read.Types.packet_lesson_progress;
		level_chunk: MCProtocol.Bedrock.Read.Types.packet_level_chunk;
		level_event: MCProtocol.Bedrock.Read.Types.packet_level_event;
		level_event_generic: MCProtocol.Bedrock.Read.Types.packet_level_event_generic;
		level_sound_event: MCProtocol.Bedrock.Read.Types.packet_level_sound_event;
		level_sound_event_old: MCProtocol.Bedrock.Read.Types.packet_level_sound_event_old;
		level_sound_event_v2: MCProtocol.Bedrock.Read.Types.packet_level_sound_event_v2;
		/** Versions: 1.26.10 – 1.26.60 */
		locator_bar: MCProtocol.Bedrock.Read.Types.packet_locator_bar;
		login: MCProtocol.Bedrock.Read.Types.packet_login;
		map_create_locked_copy: MCProtocol.Bedrock.Read.Types.packet_map_create_locked_copy;
		map_info_request: MCProtocol.Bedrock.Read.Types.packet_map_info_request;
		mob_armor_equipment: MCProtocol.Bedrock.Read.Types.packet_mob_armor_equipment;
		mob_effect: MCProtocol.Bedrock.Read.Types.packet_mob_effect;
		mob_equipment: MCProtocol.Bedrock.Read.Types.packet_mob_equipment;
		modal_form_request: MCProtocol.Bedrock.Read.Types.packet_modal_form_request;
		modal_form_response: MCProtocol.Bedrock.Read.Types.packet_modal_form_response;
		motion_prediction_hints: MCProtocol.Bedrock.Read.Types.packet_motion_prediction_hints;
		move_entity: MCProtocol.Bedrock.Read.Types.packet_move_entity;
		move_entity_delta: MCProtocol.Bedrock.Read.Types.packet_move_entity_delta;
		move_player: MCProtocol.Bedrock.Read.Types.packet_move_player;
		/** Versions: 1.21.42 – 1.26.60 */
		movement_effect: MCProtocol.Bedrock.Read.Types.packet_movement_effect;
		multiplayer_settings: MCProtocol.Bedrock.Read.Types.packet_multiplayer_settings;
		network_chunk_publisher_update: MCProtocol.Bedrock.Read.Types.packet_network_chunk_publisher_update;
		network_settings: MCProtocol.Bedrock.Read.Types.packet_network_settings;
		network_stack_latency: MCProtocol.Bedrock.Read.Types.packet_network_stack_latency;
		/** Versions: 1.17.10 – 1.26.60 */
		npc_dialogue: MCProtocol.Bedrock.Read.Types.packet_npc_dialogue;
		npc_request: MCProtocol.Bedrock.Read.Types.packet_npc_request;
		on_screen_texture_animation: MCProtocol.Bedrock.Read.Types.packet_on_screen_texture_animation;
		/** Versions: 1.19.80 – 1.26.60 */
		open_sign: MCProtocol.Bedrock.Read.Types.packet_open_sign;
		packet_violation_warning: MCProtocol.Bedrock.Read.Types.packet_packet_violation_warning;
		/** Versions: 1.26.10 – 1.26.60 */
		party_changed: MCProtocol.Bedrock.Read.Types.packet_party_changed;
		/** Versions: 1.26.30 – 1.26.60 */
		party_destination_cookie_response: MCProtocol.Bedrock.Read.Types.packet_party_destination_cookie_response;
		/** Versions: 1.17.30 – 1.26.60 */
		photo_info_request: MCProtocol.Bedrock.Read.Types.packet_photo_info_request;
		photo_transfer: MCProtocol.Bedrock.Read.Types.packet_photo_transfer;
		play_sound: MCProtocol.Bedrock.Read.Types.packet_play_sound;
		play_status: MCProtocol.Bedrock.Read.Types.packet_play_status;
		player_action: MCProtocol.Bedrock.Read.Types.packet_player_action;
		player_armor_damage: MCProtocol.Bedrock.Read.Types.packet_player_armor_damage;
		player_auth_input: MCProtocol.Bedrock.Read.Types.packet_player_auth_input;
		player_enchant_options: MCProtocol.Bedrock.Read.Types.packet_player_enchant_options;
		player_fog: MCProtocol.Bedrock.Read.Types.packet_player_fog;
		player_hotbar: MCProtocol.Bedrock.Read.Types.packet_player_hotbar;
		player_input: MCProtocol.Bedrock.Read.Types.packet_player_input;
		player_list: MCProtocol.Bedrock.Read.Types.packet_player_list;
		/** Versions: 1.21.80 – 1.26.60 */
		player_location: MCProtocol.Bedrock.Read.Types.packet_player_location;
		player_skin: MCProtocol.Bedrock.Read.Types.packet_player_skin;
		/** Versions: 1.21.70 – 1.26.60 */
		player_update_entity_overrides: MCProtocol.Bedrock.Read.Types.packet_player_update_entity_overrides;
		/** Versions: 1.21.70 – 1.26.60 */
		player_video_capture: MCProtocol.Bedrock.Read.Types.packet_player_video_capture;
		position_tracking_db_broadcast: MCProtocol.Bedrock.Read.Types.packet_position_tracking_db_broadcast;
		position_tracking_db_request: MCProtocol.Bedrock.Read.Types.packet_position_tracking_db_request;
		/** Versions: 1.26.20 – 1.26.60 */
		primitive_shapes: MCProtocol.Bedrock.Read.Types.packet_primitive_shapes;
		purchase_receipt: MCProtocol.Bedrock.Read.Types.packet_purchase_receipt;
		/** Versions: 1.26.51 – 1.26.60 */
		record_started: MCProtocol.Bedrock.Read.Types.packet_record_started;
		/** Versions: 1.20.30 – 1.26.60 */
		refresh_entitlements: MCProtocol.Bedrock.Read.Types.packet_refresh_entitlements;
		/** Versions: 1.16.201 – 1.20.50 */
		remove_ecs_entity: MCProtocol.Bedrock.Read.Types.packet_remove_ecs_entity;
		remove_entity: MCProtocol.Bedrock.Read.Types.packet_remove_entity;
		remove_objective: MCProtocol.Bedrock.Read.Types.packet_remove_objective;
		/** Versions: 1.17.0 – 1.26.60 */
		remove_volume_entity: MCProtocol.Bedrock.Read.Types.packet_remove_volume_entity;
		/** Versions: 1.19.1 – 1.26.60 */
		request_ability: MCProtocol.Bedrock.Read.Types.packet_request_ability;
		request_chunk_radius: MCProtocol.Bedrock.Read.Types.packet_request_chunk_radius;
		/** Versions: 1.19.30 – 1.26.60 */
		request_network_settings: MCProtocol.Bedrock.Read.Types.packet_request_network_settings;
		/** Versions: 1.19.1 – 1.26.60 */
		request_permissions: MCProtocol.Bedrock.Read.Types.packet_request_permissions;
		resource_pack_chunk_data: MCProtocol.Bedrock.Read.Types.packet_resource_pack_chunk_data;
		resource_pack_chunk_request: MCProtocol.Bedrock.Read.Types.packet_resource_pack_chunk_request;
		resource_pack_client_response: MCProtocol.Bedrock.Read.Types.packet_resource_pack_client_response;
		resource_pack_data_info: MCProtocol.Bedrock.Read.Types.packet_resource_pack_data_info;
		resource_pack_stack: MCProtocol.Bedrock.Read.Types.packet_resource_pack_stack;
		resource_packs_info: MCProtocol.Bedrock.Read.Types.packet_resource_packs_info;
		/** Versions: 1.26.10 – 1.26.60 */
		resource_packs_ready_for_validation: MCProtocol.Bedrock.Read.Types.packet_resource_packs_ready_for_validation;
		respawn: MCProtocol.Bedrock.Read.Types.packet_respawn;
		rider_jump: MCProtocol.Bedrock.Read.Types.packet_rider_jump;
		script_custom_event: MCProtocol.Bedrock.Read.Types.packet_script_custom_event;
		/** Versions: 1.18.11 – 1.26.60 */
		script_message: MCProtocol.Bedrock.Read.Types.packet_script_message;
		/** Versions: 1.26.30 – 1.26.60 */
		send_party_destination_cookie: MCProtocol.Bedrock.Read.Types.packet_send_party_destination_cookie;
		/** Versions: 1.20.50 – 1.26.60 */
		server_post_move: MCProtocol.Bedrock.Read.Types.packet_server_post_move;
		/** Versions: 1.26.20 – 1.26.60 */
		server_presence_info: MCProtocol.Bedrock.Read.Types.packet_server_presence_info;
		/** Versions: 1.21.90 – 1.26.60 */
		server_script_debug_drawer: MCProtocol.Bedrock.Read.Types.packet_server_script_debug_drawer;
		server_settings_request: MCProtocol.Bedrock.Read.Types.packet_server_settings_request;
		server_settings_response: MCProtocol.Bedrock.Read.Types.packet_server_settings_response;
		/** Versions: 1.19.30 – 1.26.60 */
		server_stats: MCProtocol.Bedrock.Read.Types.packet_server_stats;
		/** Versions: 1.26.20 – 1.26.60 */
		server_store_info: MCProtocol.Bedrock.Read.Types.packet_server_store_info;
		server_to_client_handshake: MCProtocol.Bedrock.Read.Types.packet_server_to_client_handshake;
		/** Versions: 1.26.60 */
		serverbound_cursor_item_drag: MCProtocol.Bedrock.Read.Types.packet_serverbound_cursor_item_drag;
		/** Versions: 1.26.10 – 1.26.60 */
		serverbound_data_driven_screen_closed: MCProtocol.Bedrock.Read.Types.packet_serverbound_data_driven_screen_closed;
		/** Versions: 1.21.130 – 1.26.60 */
		serverbound_data_store: MCProtocol.Bedrock.Read.Types.packet_serverbound_data_store;
		/** Versions: 1.21.20 – 1.26.60 */
		serverbound_diagnostics: MCProtocol.Bedrock.Read.Types.packet_serverbound_diagnostics;
		/** Versions: 1.21.20 – 1.26.60 */
		serverbound_loading_screen: MCProtocol.Bedrock.Read.Types.packet_serverbound_loading_screen;
		/** Versions: 1.26.60 */
		serverbound_matchmaking_cancel: MCProtocol.Bedrock.Read.Types.packet_serverbound_matchmaking_cancel;
		/** Versions: 1.21.111 – 1.26.60 */
		serverbound_pack_setting_change: MCProtocol.Bedrock.Read.Types.packet_serverbound_pack_setting_change;
		/** Versions: 1.26.60 */
		serverbound_register_audio_content: MCProtocol.Bedrock.Read.Types.packet_serverbound_register_audio_content;
		/** Versions: 1.26.60 */
		serverbound_stonecutter_set_recipe: MCProtocol.Bedrock.Read.Types.packet_serverbound_stonecutter_set_recipe;
		set_commands_enabled: MCProtocol.Bedrock.Read.Types.packet_set_commands_enabled;
		set_default_game_type: MCProtocol.Bedrock.Read.Types.packet_set_default_game_type;
		set_difficulty: MCProtocol.Bedrock.Read.Types.packet_set_difficulty;
		set_display_objective: MCProtocol.Bedrock.Read.Types.packet_set_display_objective;
		set_entity_data: MCProtocol.Bedrock.Read.Types.packet_set_entity_data;
		set_entity_link: MCProtocol.Bedrock.Read.Types.packet_set_entity_link;
		set_entity_motion: MCProtocol.Bedrock.Read.Types.packet_set_entity_motion;
		set_health: MCProtocol.Bedrock.Read.Types.packet_set_health;
		/** Versions: 1.20.61 – 1.26.60 */
		set_hud: MCProtocol.Bedrock.Read.Types.packet_set_hud;
		set_last_hurt_by: MCProtocol.Bedrock.Read.Types.packet_set_last_hurt_by;
		set_local_player_as_initialized: MCProtocol.Bedrock.Read.Types.packet_set_local_player_as_initialized;
		/** Versions: 1.21.42 – 1.26.60 */
		set_movement_authority: MCProtocol.Bedrock.Read.Types.packet_set_movement_authority;
		/** Versions: 1.26.60 */
		set_passenger_of_block: MCProtocol.Bedrock.Read.Types.packet_set_passenger_of_block;
		/** Versions: 1.26.51 – 1.26.60 */
		set_player_furnace_options: MCProtocol.Bedrock.Read.Types.packet_set_player_furnace_options;
		set_player_game_type: MCProtocol.Bedrock.Read.Types.packet_set_player_game_type;
		/** Versions: 1.20.50 – 1.26.60 */
		set_player_inventory_options: MCProtocol.Bedrock.Read.Types.packet_set_player_inventory_options;
		set_score: MCProtocol.Bedrock.Read.Types.packet_set_score;
		set_scoreboard_identity: MCProtocol.Bedrock.Read.Types.packet_set_scoreboard_identity;
		set_spawn_position: MCProtocol.Bedrock.Read.Types.packet_set_spawn_position;
		set_time: MCProtocol.Bedrock.Read.Types.packet_set_time;
		set_title: MCProtocol.Bedrock.Read.Types.packet_set_title;
		settings_command: MCProtocol.Bedrock.Read.Types.packet_settings_command;
		show_credits: MCProtocol.Bedrock.Read.Types.packet_show_credits;
		show_profile: MCProtocol.Bedrock.Read.Types.packet_show_profile;
		show_store_offer: MCProtocol.Bedrock.Read.Types.packet_show_store_offer;
		simple_event: MCProtocol.Bedrock.Read.Types.packet_simple_event;
		/** Versions: 1.17.10 – 1.26.60 */
		simulation_type: MCProtocol.Bedrock.Read.Types.packet_simulation_type;
		spawn_experience_orb: MCProtocol.Bedrock.Read.Types.packet_spawn_experience_orb;
		spawn_particle_effect: MCProtocol.Bedrock.Read.Types.packet_spawn_particle_effect;
		start_game: MCProtocol.Bedrock.Read.Types.packet_start_game;
		stop_sound: MCProtocol.Bedrock.Read.Types.packet_stop_sound;
		structure_block_update: MCProtocol.Bedrock.Read.Types.packet_structure_block_update;
		structure_template_data_export_request: MCProtocol.Bedrock.Read.Types.packet_structure_template_data_export_request;
		structure_template_data_export_response: MCProtocol.Bedrock.Read.Types.packet_structure_template_data_export_response;
		sub_client_login: MCProtocol.Bedrock.Read.Types.packet_sub_client_login;
		/** Versions: 1.17.40 – 1.26.60 */
		subchunk: MCProtocol.Bedrock.Read.Types.packet_subchunk;
		/** Versions: 1.17.40 – 1.26.60 */
		subchunk_request: MCProtocol.Bedrock.Read.Types.packet_subchunk_request;
		/** Versions: 1.17.0 – 1.26.60 */
		sync_entity_property: MCProtocol.Bedrock.Read.Types.packet_sync_entity_property;
		/** Versions: 1.26.10 – 1.26.60 */
		sync_world_clocks: MCProtocol.Bedrock.Read.Types.packet_sync_world_clocks;
		take_item_entity: MCProtocol.Bedrock.Read.Types.packet_take_item_entity;
		text: MCProtocol.Bedrock.Read.Types.packet_text;
		tick_sync: MCProtocol.Bedrock.Read.Types.packet_tick_sync;
		/** Versions: 1.18.30 – 1.26.60 */
		ticking_areas_load_status: MCProtocol.Bedrock.Read.Types.packet_ticking_areas_load_status;
		/** Versions: 1.19.1 – 1.26.60 */
		toast_request: MCProtocol.Bedrock.Read.Types.packet_toast_request;
		/** Versions: 1.20.50 – 1.26.60 */
		toggle_crafter_slot_request: MCProtocol.Bedrock.Read.Types.packet_toggle_crafter_slot_request;
		transfer: MCProtocol.Bedrock.Read.Types.packet_transfer;
		/** Versions: 1.19.80 – 1.26.60 */
		trim_data: MCProtocol.Bedrock.Read.Types.packet_trim_data;
		/** Versions: 1.19.70 – 1.26.60 */
		unlocked_recipes: MCProtocol.Bedrock.Read.Types.packet_unlocked_recipes;
		/** Versions: 1.19.10 – 1.26.60 */
		update_abilities: MCProtocol.Bedrock.Read.Types.packet_update_abilities;
		/** Versions: 1.19.10 – 1.26.60 */
		update_adventure_settings: MCProtocol.Bedrock.Read.Types.packet_update_adventure_settings;
		update_attributes: MCProtocol.Bedrock.Read.Types.packet_update_attributes;
		update_block: MCProtocol.Bedrock.Read.Types.packet_update_block;
		update_block_properties: MCProtocol.Bedrock.Read.Types.packet_update_block_properties;
		update_block_synced: MCProtocol.Bedrock.Read.Types.packet_update_block_synced;
		/** Versions: 1.19.50 – 1.26.60 */
		update_client_input_locks: MCProtocol.Bedrock.Read.Types.packet_update_client_input_locks;
		/** Versions: 1.21.70 – 1.26.60 */
		update_client_options: MCProtocol.Bedrock.Read.Types.packet_update_client_options;
		update_equipment: MCProtocol.Bedrock.Read.Types.packet_update_equipment;
		update_player_game_type: MCProtocol.Bedrock.Read.Types.packet_update_player_game_type;
		update_soft_enum: MCProtocol.Bedrock.Read.Types.packet_update_soft_enum;
		/** Versions: 1.17.30 – 1.26.60 */
		update_subchunk_blocks: MCProtocol.Bedrock.Read.Types.packet_update_subchunk_blocks;
		update_trade: MCProtocol.Bedrock.Read.Types.packet_update_trade;
		video_stream_connect: MCProtocol.Bedrock.Read.Types.packet_video_stream_connect;
		/** Versions: 1.26.0 – 1.26.60 */
		voxel_shapes: MCProtocol.Bedrock.Read.Types.packet_voxel_shapes;
	}
}

export namespace MCProtocol.Bedrock.Write.Types {
	export type ByteArray = Buffer;
	export type SignedByteArray = Buffer;
	export type LittleString = string;
	export type LatinString = string;
	/**
	 * Versions: 1.16.201 – 1.21.20
	 */
	export type BehaviourPackInfos = {
		uuid: string;
		version: string;
		size: Int64Write;
		content_key: string;
		sub_pack_name: string;
		content_identity: string;
		has_scripts: boolean;
		addon_pack?: boolean | undefined;
	}[];
	/**
	 * As of 1.26.40 the pack list is prefixed with a varint count instead of a little endian short.
	 */
	export type TexturePackInfos = {
		uuid: string;
		version: string;
		size: Int64Write;
		content_key: string;
		sub_pack_name: string;
		content_identity: string;
		has_scripts: boolean;
		rtx_enabled: boolean;
		addon_pack?: boolean | undefined;
		/** cdn_url is a URL that the client can use to download the pack instead of the server sending it in chunks, which it will continue to do if this field is left empty. */
		cdn_url?: string | undefined;
	}[];
	export type ResourcePackIdVersions = {
		/** The ID of the resource pack. */
		uuid: string;
		/** The version of the resource pack. */
		version: string;
		/** The subpack name of the resource pack. */
		name: string;
	}[];
	export type ResourcePackIds = string[];
	export type Experiment = {
		name: string;
		enabled: boolean;
	};
	export type Experiments = Experiment[];
	export type GameMode = "survival" | "creative" | "adventure" | "survival_spectator" | "creative_spectator" | "fallback" | number | "spectator";
	/**
	 * Versions: 1.16.201 – 1.21.100
	 */
	export type GameRule = {
		/** Versions: 1.16.201 – 1.21.100 */
		name: string;
		/** Versions: 1.16.201 – 1.21.100 */
		type: "bool" | "int" | "float" | number;
		/** Versions: 1.16.201 – 1.21.100 */
		value?: boolean | number | undefined;
		/** Versions: 1.17.0 – 1.21.100 */
		editable?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.21.100
	 */
	export type GameRules = GameRule[];
	/**
	 * CacheBlob represents a blob as used in the client side blob cache protocol. It holds a hash of its data and
	 * the full data of it.
	 */
	export type Blob = {
		/** Hash is the hash of the blob. The hash is computed using xxHash, and must be deterministic for the same chunk data. */
		hash: Int64Write;
		/** Payload is the data of the blob. When sent, the client will associate the Hash of the blob with the Payload in it. */
		payload: ByteArray;
	};
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type BlockPalette = {
		name: string;
		state: NBT;
	}[];
	export type Itemstates = {
		name: string;
		runtime_id: number;
		component_based: boolean;
		/** Version is the version of the item entry which is used by the client to determine how to handle the item entry. It is one of the constants above. */
		version?: "legacy" | "data_driven" | "none" | number | undefined;
		/** Components on the item */
		nbt?: NBT | undefined;
	}[];
	/**
	 * Versions: 1.16.201 – 1.26.30
	 */
	export type Item = {
		/** Versions: 1.16.201 – 1.26.30 */
		network_id: number;
		/** Versions: 1.16.201 – 1.16.210 */
		auxiliary_value?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		has_nbt?: "false" | false | "true" | true | number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		nbt?: {
			version: number;
			nbt: NBT;
		} | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		can_place_on?: string[] | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		can_destroy?: string[] | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		blocking_tick?: bigint | number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		count?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		metadata?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		has_stack_id?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		stack_id?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		block_runtime_id?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		extra?: ItemExtraDataWithBlockingTick | ItemExtraDataWithoutBlockingTick | undefined;
	};
	export type vec3i = {
		x: number;
		y: number;
		z: number;
	};
	export type vec3u = {
		x: number;
		y: number;
		z: number;
	};
	export type vec3f = {
		x: number;
		y: number;
		z: number;
	};
	export type vec2f = {
		x: number;
		z: number;
	};
	export type MetadataDictionary = {
		/** https://github.com/pmmp/PocketMine-MP/blob/stable/src/pocketmine/entity/Entity.php#L101 */
		key: "index" | "health" | "variant" | "color" | "nametag" | "owner_eid" | "target_eid" | "air" | "potion_color" | "potion_ambient" | "jump_duration" | "hurt_time" | "hurt_direction" | "paddle_time_left" | "paddle_time_right" | "experience_value" | "minecart_display_block" | "minecart_display_offset" | "minecart_has_display" | "old_swell" | "swell_dir" | "charge_amount" | "enderman_held_runtime_id" | "entity_age" | "player_flags" | "player_index" | "player_bed_position" | "fireball_power_x" | "fireball_power_y" | "fireball_power_z" | "aux_power" | "fish_x" | "fish_z" | "fish_angle" | "potion_aux_value" | "lead_holder_eid" | "scale" | "interactive_tag" | "npc_skin_id" | "url_tag" | "max_airdata_max_air" | "mark_variant" | "container_type" | "container_base_size" | "container_extra_slots_per_strength" | "block_target" | "wither_invulnerable_ticks" | "wither_target_1" | "wither_target_2" | "wither_target_3" | "aerial_attack" | "boundingbox_width" | "boundingbox_height" | "fuse_length" | "rider_seat_position" | "rider_rotation_locked" | "rider_max_rotation" | "rider_min_rotation" | "area_effect_cloud_radius" | "area_effect_cloud_waiting" | "area_effect_cloud_particle_id" | "shulker_peek_id" | "shulker_attach_face" | "shulker_attached" | "shulker_attach_pos" | "trading_player_eid" | "trading_career" | "has_command_block" | "command_block_command" | "command_block_last_output" | "command_block_track_output" | "controlling_rider_seat_number" | "strength" | "max_strength" | "spell_casting_color" | "limited_life" | "armor_stand_pose_index" | "ender_crystal_time_offset" | "always_show_nametag" | "color_2" | "name_author" | "score_tag" | "balloon_attached_entity" | "pufferfish_size" | "bubble_time" | "agent" | "sitting_amount" | "sitting_amount_previous" | "eating_counter" | "flags_extended" | "laying_amount" | "laying_amount_previous" | "duration" | "spawn_time" | "change_rate" | "change_on_pickup" | "pickup_count" | "interact_text" | "trade_tier" | "max_trade_tier" | "trade_experience" | "skin_id" | "spawning_frames" | "command_block_tick_delay" | "command_block_execute_on_first_tick" | "ambient_sound_interval" | "ambient_sound_interval_range" | "ambient_sound_event_name" | "fall_damage_multiplier" | "name_raw_text" | "can_ride_target" | "low_tier_cured_discount" | "high_tier_cured_discount" | "nearby_cured_discount" | "nearby_cured_discount_timestamp" | "hitbox" | "is_buoyant" | "buoyancy_data" | number | "flags" | "horse_type" | "creeper_swell" | "creeper_swell_direction" | "wither_aerial_attack" | "rider_seat_rotation_offset" | "evoker_spell_casting_color" | "area_effect_cloud_duration" | "area_effect_cloud_spawn_time" | "area_effect_cloud_change_rate" | "area_effect_cloud_change_on_pickup" | "area_effect_cloud_pickup_count" | "goat_horn_count" | "freezing_effect_strength" | "base_runtime_id" | "define_properties" | "update_properties" | "movement_sound_distance_offset" | "heartbeat_interval_ticks" | "heartbeat_sound_event" | "player_last_death_position" | "player_last_death_dimension" | "player_has_died" | "collision_box" | "visible_mob_effects" | "filtered_name" | "bed_enter_position" | "seat_third_person_camera_radius" | "seat_camera_relax_distance_smoothing" | "aim_assist_priority_preset_id" | "aim_assist_priority_category_id" | "aim_assist_priority_actor_id" | "arrow_shooter_id" | "firework_direction" | "firework_shooter_id" | "reserved_139" | "nameplate_render_distance_max";
		type: "byte" | "short" | "int" | "float" | "string" | "compound" | "vec3i" | "long" | "vec3f" | number;
		value?: number | string | NBT | vec3i | bigint | number | vec3f | MetadataFlags1 | MetadataFlags2 | undefined;
		/** As of 1.26.40 the value type is sent twice: once as an unsigned varint and once as a byte. */
		legacy_type?: number | undefined;
	}[];
	export type Link = {
		ridden_entity_id: bigint | number;
		rider_entity_id: bigint | number;
		type: number;
		immediate: boolean;
		rider_initiated: boolean;
		/** angular velocity of the vehicle that the rider is riding. Versions: 1.21.20 – 1.26.60 */
		angular_velocity?: number | undefined;
	};
	export type Links = Link[];
	export type EntityAttributes = {
		name: string;
		min: number;
		value: number;
		max: number;
	}[];
	export type Rotation = {
		yaw: number;
		pitch: number;
		head_yaw: number;
	};
	export type BlockCoordinates = {
		x: number;
		y: number;
		z: number;
	};
	export type PlayerAttributes = {
		min: number;
		max: number;
		current: number;
		default: number;
		name: string;
		modifiers?: {
			id: string;
			name: string;
			amount: number;
			operation: number;
			operand: number;
			serializable: boolean;
		}[] | undefined;
		default_min?: number | undefined;
		default_max?: number | undefined;
	}[];
	/**
	 * As of 1.26.40 the inventory transaction embedded in PlayerAuthInput was brought back in line with the
	 * one in InventoryTransaction, so it reuses `TransactionLegacy`/`TransactionActions` above again.
	 */
	export type Transaction = {
		/** Versions: 1.16.201 */
		legacy_request_id?: number | undefined;
		/** Versions: 1.16.201 */
		legacy_transactions?: {
			container_id: number;
			changed_slots: {
				slot_id: number;
			}[];
		}[] | undefined;
		/** What type of transaction took place */
		transaction_type?: "normal" | "inventory_mismatch" | "item_use" | "item_use_on_entity" | "item_release" | number | undefined;
		/** Versions: 1.16.201 */
		network_ids?: boolean | undefined;
		/** Versions: 1.16.201 */
		inventory_actions?: {
			source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
			inventory_id?: number | undefined;
			flags?: number | undefined;
			action?: number | undefined;
			slot: number;
			old_item: Item;
			new_item: Item;
			new_item_stack_id?: number | undefined;
		}[] | undefined;
		/** Extra data if an intenal inventory transaction did not take place, e.g. use of an item */
		transaction_data?: {
			action_type: "click_block" | "click_air" | "break_block" | number;
			block_position: BlockCoordinates;
			face: number;
			hotbar_slot: number;
			held_item: Item;
			player_pos: vec3f;
			click_pos: vec3f;
			block_runtime_id: number;
		} | {
			entity_runtime_id: bigint | number;
			action_type: "interact" | "attack" | number;
			hotbar_slot: number;
			held_item: Item;
			player_pos: vec3f;
			click_pos: vec3f;
		} | {
			action_type: "release" | "consume" | number;
			hotbar_slot: number;
			held_item: Item;
			head_pos: vec3f;
		} | TransactionUseItem | {
			entity_runtime_id: bigint | number;
			action_type: "interact" | "attack" | number;
			hotbar_slot: number;
			held_item: ItemV4;
			player_pos: vec3f;
			click_pos: vec3f;
		} | {
			action_type: "release" | "consume" | number;
			hotbar_slot: number;
			held_item: ItemV4;
			head_pos: vec3f;
		} | {
			entity_runtime_id: bigint | number;
			action_type: "interact" | "attack" | number;
			hotbar_slot: number;
			hand: "main_hand" | "off_hand" | number;
			held_item: ItemV4;
			player_pos: vec3f;
			click_pos: vec3f;
		} | {
			action_type: "release" | "consume" | number;
			hotbar_slot: number;
			held_item: ItemV4;
			head_pos: vec3f;
			hand: "main_hand" | "off_hand" | number;
		} | undefined;
		/** Old transaction system data Versions: 1.16.210 – 1.26.60 */
		legacy?: TransactionLegacy | undefined;
		/** The list of inventory internal actions in this packet, e.g. inventory GUI actions Versions: 1.16.210 – 1.26.60 */
		actions?: TransactionActions | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type ItemStack = {
		/** Versions: 1.16.201 */
		runtime_id?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		item: Item;
		/** Versions: 1.16.210 */
		stack_id?: number | undefined;
	};
	export type ItemStacks = ItemStack[] | Item[] | ItemV4[];
	/**
	 * As of 1.26.40 the descriptor is identified by a string rather than by the numeric tag. The leading
	 * varint only distinguishes 'no descriptor' (0) from 'a descriptor follows' (1); when it is 1 the actual
	 * kind is read from the descriptor_type string. The deferred and complex alias descriptors are gone.
	 */
	export type RecipeIngredient = {
		/** Versions: 1.16.201 – 1.26.30 */
		network_id?: number | undefined;
		/** Versions: 1.16.201 – 1.19.21 */
		network_data?: number | undefined;
		count?: number | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		type?: "invalid" | "int_id_meta" | "molang" | "item_tag" | "string_id_meta" | number | "complex_alias" | "valid" | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		metadata?: number | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		expression?: string | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		version?: number | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		tag?: string | undefined;
		/** Versions: 1.19.30 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		descriptor_type?: string | undefined;
	};
	export type PotionTypeRecipes = {
		input_item_id: number;
		input_item_meta: number;
		ingredient_id: number;
		ingredient_meta: number;
		output_item_id: number;
		output_item_meta: number;
	}[];
	export type PotionContainerChangeRecipes = {
		input_item_id: number;
		ingredient_id: number;
		output_item_id: number;
	}[];
	/**
	 * Versions: 1.16.201 – 1.26.30
	 */
	export type Recipes = {
		type: "shapeless" | "shaped" | "furnace" | "furnace_with_metadata" | "multi" | "shulker_box" | "shapeless_chemistry" | "shaped_chemistry" | number | "smithing_transform" | "smithing_trim";
		recipe?: {
			recipe_id: LatinString;
			input: RecipeIngredient[];
			output: Item[];
			uuid: string;
			block: string;
			priority: number;
			network_id: number;
		} | {
			recipe_id: LatinString;
			width: number;
			height: number;
			input: RecipeIngredient[][];
			output: Item[];
			uuid: string;
			block: string;
			priority: number;
			network_id: number;
		} | {
			input_id: number;
			output: Item;
			block: string;
		} | {
			input_id: number;
			input_meta: number;
			output: Item;
			block: string;
		} | {
			uuid: string;
			network_id: number;
		} | {
			recipe_id: LatinString;
			input: RecipeIngredient[];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			network_id: number;
		} | {
			recipe_id: LatinString;
			width: number;
			height: number;
			input: RecipeIngredient[][];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			network_id: number;
		} | {
			input_id: number;
			output: ItemLegacy;
			block: string;
		} | {
			input_id: number;
			input_meta: number;
			output: ItemLegacy;
			block: string;
		} | {
			recipe_id: LatinString;
			base: RecipeIngredient;
			addition: RecipeIngredient;
			result: ItemLegacy;
			tag: string;
			network_id: number;
		} | {
			recipe_id: LatinString;
			template: RecipeIngredient;
			base: RecipeIngredient;
			addition: RecipeIngredient;
			result: ItemLegacy;
			tag: string;
			network_id: number;
		} | {
			recipe_id: LatinString;
			template: RecipeIngredient;
			input: RecipeIngredient;
			addition: RecipeIngredient;
			block: string;
			network_id: number;
		} | {
			recipe_id: LatinString;
			width: number;
			height: number;
			input: RecipeIngredient[][];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			assume_symmetry: boolean;
			network_id: number;
		} | {
			recipe_id: LatinString;
			input: RecipeIngredient[];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			unlocking_requirement: RecipeUnlockingRequirement;
			network_id: number;
		} | {
			recipe_id: LatinString;
			width: number;
			height: number;
			input: RecipeIngredient[][];
			output: ItemLegacy[];
			uuid: string;
			block: string;
			priority: number;
			assume_symmetry: boolean;
			unlocking_requirement: RecipeUnlockingRequirement;
			network_id: number;
		} | undefined;
	}[];
	export type SkinImage = {
		width: number;
		height: number;
		data: string | ByteArray;
	};
	export type Skin = {
		skin_id: string;
		skin_resource_pack: string;
		skin_data: SkinImage;
		animations: {
			skin_image: SkinImage;
			animation_type: number;
			animation_frames: number;
			expression_type: number;
		}[];
		cape_data: SkinImage;
		geometry_data: string;
		animation_data: string;
		premium: string | boolean;
		persona: boolean;
		cape_on_classic: boolean;
		cape_id: string;
		full_skin_id: string;
		arm_size: string | "slim" | "wide" | number;
		skin_color: string | number;
		personal_pieces: {
			piece_id: string;
			piece_type: string | PersonaPieceType;
			pack_id: string;
			is_default_piece: boolean;
			product_id: string;
		}[];
		piece_tint_colors: {
			piece_type: string;
			colors: string[] | number[];
		}[];
		/** Versions: 1.16.210 – 1.26.51 */
		play_fab_id?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		geometry_data_version?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		primary_user?: boolean | undefined;
		/** Versions: 1.19.62 – 1.26.60 */
		overriding_player_appearance?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		trusted?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		profile_hash?: string | undefined;
	};
	/**
	 * BDS 1.26.40 may truncate the final record. Player List is a packet-bounded payload, so treat the declared
	 * count as an upper bound and stop decoding when the packet ends, including midway through the final record.
	 */
	export type PlayerRecords = {
		/** Versions: 1.16.201 – 1.26.30 */
		type: "add" | "remove" | number;
		/** Versions: 1.16.201 – 1.26.30 */
		records_count: number;
		/** Versions: 1.16.201 – 1.26.30 */
		records: Array<{
			uuid: string;
			entity_unique_id: bigint | number;
			username: string;
			xbox_user_id: string;
			platform_chat_id: string;
			build_platform: number;
			skin_data: Skin;
			is_teacher: boolean;
			is_host: boolean;
		} | {
			uuid: string;
		} | undefined> | Array<{
			uuid: string;
			entity_unique_id: bigint | number;
			username: string;
			xbox_user_id: string;
			platform_chat_id: string;
			build_platform: number;
			skin_data: Skin;
			is_teacher: boolean;
			is_host: boolean;
			is_subclient: boolean;
		} | {
			uuid: string;
		} | undefined> | Array<{
			uuid: string;
			entity_unique_id: bigint | number;
			username: string;
			xbox_user_id: string;
			platform_chat_id: string;
			build_platform: number;
			skin_data: Skin;
			is_teacher: boolean;
			is_host: boolean;
			is_subclient: boolean;
			player_color: number;
		} | {
			uuid: string;
		} | undefined>;
		/** Versions: 1.16.201 – 1.26.30 */
		verified?: boolean[] | undefined;
	} | PlayerRecord[];
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type ScoreEntries = {
		/** Versions: 1.16.201 – 1.16.210 */
		type: "change" | "remove" | number;
		/** Versions: 1.16.201 – 1.16.210 */
		entries: {
			scoreboard_id: bigint | number;
			objective_name: string;
			score: number;
			entry_type?: "player" | "entity" | "fake_player" | number | undefined;
			entity_unique_id?: bigint | number | undefined;
			custom_name?: string | undefined;
		}[];
	};
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type ScoreboardIdentityEntries = {
		/** Versions: 1.16.201 – 1.16.210 */
		type: "TYPE_REGISTER_IDENTITY" | "TYPE_CLEAR_IDENTITY" | number;
		/** Versions: 1.16.201 – 1.16.210 */
		entries: {
			scoreboard_id: bigint | number;
			entity_unique_id?: bigint | number | undefined;
		}[];
	};
	export type Enchant = {
		id: number;
		level: number;
	};
	/**
	 * Versions: 1.16.201 – 1.16.210
	 */
	export type EnchantOptions = {
		cost: number;
		slot_flags: number;
		equip_enchants: Enchant[];
		held_enchants: Enchant[];
		self_enchants: Enchant[];
		name: string;
		option_id: number;
	}[];
	/**
	 * Source and Destination point to the source slot from which Count of the item stack were taken and the
	 * destination slot to which this item was moved.
	 */
	export type StackRequestSlotInfo = {
		/** Versions: 1.16.201 */
		container_id?: number | undefined;
		/** Versions: 1.16.201 */
		slot_id?: number | undefined;
		/** StackNetworkID is the unique stack ID that the client assumes to be present in this slot. The server must check if these IDs match. If they do not match, servers should reject the stack request that the action holding this info was in. As of 1.26.40 this is a little endian int instead of a zigzag varint. */
		stack_id: number;
		/** ContainerID is the ID of the container that the slot was in. Versions: 1.16.210 – 1.26.60 */
		slot_type?: ContainerSlotType | FullContainerName | undefined;
		/** Slot is the index of the slot within the container with the ContainerID above. Versions: 1.16.210 – 1.26.60 */
		slot?: number | undefined;
	};
	/**
	 * Versions: 1.16.201
	 */
	export type ItemStackRequests = {
		request_id: number;
		actions: {
			type_id: "take" | "place" | "swap" | "drop" | "destroy" | "consume" | "create" | "lab_table_combine" | "beacon_payment" | "craft_recipe" | "craft_recipe_auto" | "craft_creative" | "optional" | "non_implemented" | "results_deprecated" | number;
			count?: number | undefined;
			source?: StackRequestSlotInfo | undefined;
			destination?: StackRequestSlotInfo | undefined;
			randomly?: boolean | undefined;
			result_slot_id?: number | undefined;
			primary_effect?: number | undefined;
			secondary_effect?: number | undefined;
			recipe_network_id?: number | undefined;
			times_crafted?: number | undefined;
			creative_item_network_id?: number | undefined;
			filtered_string_index?: number | undefined;
			result_items?: Item[] | undefined;
		}[];
		custom_names: string[];
	}[];
	/**
	 * ItemStackResponse is a response to an individual ItemStackRequest.
	 */
	export type ItemStackResponses = {
		result?: number | undefined;
		/** RequestID is the unique ID of the request that this response is in reaction to. If rejected, the client will undo the actions from the request with this ID. */
		request_id: number;
		containers?: {
			container_id?: number | undefined;
			slots: {
				slot: number;
				hotbar_slot: number;
				count: number;
				item_stack_id?: number | undefined;
				custom_name: string;
				durability_correction?: number | undefined;
				filtered_custom_name?: string | undefined;
				item_stack_id_presence?: boolean | undefined;
			}[];
			slot_type?: ContainerSlotType | FullContainerName | undefined;
		}[] | undefined;
		/** Status specifies if the request with the RequestID below was successful. If this is the case, the ContainerInfo below will have information on what slots ended up changing. If not, the container info will be empty. A non-0 status means an error occurred and will result in the action being reverted. */
		status?: "ok" | "error" | number | undefined;
		containers_presence?: boolean | undefined;
	}[];
	/**
	 * Versions: 1.16.201 – 1.21.50
	 */
	export type ItemComponentList = {
		name: string;
		nbt: NBT;
	}[];
	export type CommandOrigin = {
		/** Origin is one of the values above that specifies the origin of the command. The origin may change, depending on what part of the client actually called the command. The command may be issued by a websocket server, for example. */
		type: "player" | "block" | "minecart_block" | "dev_console" | "test" | "automation_player" | "client_automation" | "dedicated_server" | "entity" | "virtual" | "game_argument" | "entity_server" | number | "precompiled" | "game_director_entity_server" | "script" | "executor" | string;
		uuid: string;
		request_id: string;
		player_entity_id?: {
			player_entity_id: bigint | number;
		} | Int64Write | undefined;
	};
	export type WindowID = "inventory" | "first" | "last" | "offhand" | "armor" | "creative" | "hotbar" | "fixed_inventory" | "ui" | "drop_contents" | "beacon" | "trading_output" | "trading_use_inputs" | "trading_input_2" | "trading_input_1" | "enchant_output" | "enchant_material" | "enchant_input" | "anvil_output" | "anvil_result" | "anvil_material" | "container_input" | "crafting_use_ingredient" | "crafting_result" | "crafting_remove_ingredient" | "crafting_add_ingredient" | "none" | number;
	export type WindowIDVarint = "inventory" | "first" | "last" | "offhand" | "armor" | "creative" | "hotbar" | "fixed_inventory" | "ui" | "drop_contents" | "beacon" | "trading_output" | "trading_use_inputs" | "trading_input_2" | "trading_input_1" | "enchant_output" | "enchant_material" | "enchant_input" | "anvil_output" | "anvil_result" | "anvil_material" | "container_input" | "crafting_use_ingredient" | "crafting_result" | "crafting_remove_ingredient" | "crafting_add_ingredient" | "none" | number;
	export type WindowType = "container" | "workbench" | "furnace" | "enchantment" | "brewing_stand" | "anvil" | "dispenser" | "dropper" | "hopper" | "cauldron" | "minecart_chest" | "minecart_hopper" | "horse" | "beacon" | "structure_editor" | "trading" | "command_block" | "jukebox" | "armor" | "hand" | "compound_creator" | "element_constructor" | "material_reducer" | "lab_table" | "loom" | "lectern" | "grindstone" | "blast_furnace" | "smoker" | "stonecutter" | "cartography" | "hud" | "jigsaw_editor" | "smithing_table" | number | "none" | "inventory" | "chest_boat" | "decorated_pot" | "crafter";
	/**
	 * TODO: remove?
	 */
	export type LegacyEntityType = "chicken" | "cow" | "pig" | "sheep" | "wolf" | "villager" | "mooshroom" | "squid" | "rabbit" | "bat" | "iron_golem" | "snow_golem" | "ocelot" | "horse" | "donkey" | "mule" | "skeleton_horse" | "zombie_horse" | "polar_bear" | "llama" | "parrot" | "dolphin" | "zombie" | "creeper" | "skeleton" | "spider" | "zombie_pigman" | "slime" | "enderman" | "silverfish" | "cave_spider" | "ghast" | "magma_cube" | "blaze" | "zombie_villager" | "witch" | "stray" | "husk" | "wither_skeleton" | "guardian" | "elder_guardian" | "npc" | "wither" | "ender_dragon" | "shulker" | "endermite" | "agent" | "vindicator" | "phantom" | "armor_stand" | "tripod_camera" | "player" | "item" | "tnt" | "falling_block" | "moving_block" | "xp_bottle" | "xp_orb" | "eye_of_ender_signal" | "ender_crystal" | "fireworks_rocket" | "thrown_trident" | "turtle" | "cat" | "shulker_bullet" | "fishing_hook" | "chalkboard" | "dragon_fireball" | "arrow" | "snowball" | "egg" | "painting" | "minecart" | "fireball" | "splash_potion" | "ender_pearl" | "leash_knot" | "wither_skull" | "boat" | "wither_skull_dangerous" | "lightning_bolt" | "small_fireball" | "area_effect_cloud" | "hopper_minecart" | "tnt_minecart" | "chest_minecart" | "command_block_minecart" | "lingering_potion" | "llama_spit" | "evocation_fang" | "evocation_illager" | "vex" | "ice_bomb" | "balloon" | "pufferfish" | "salmon" | "drowned" | "tropicalfish" | "cod" | "panda" | number;
	export type mcpe_packet = {
		name: "login" | "play_status" | "server_to_client_handshake" | "client_to_server_handshake" | "disconnect" | "resource_packs_info" | "resource_pack_stack" | "resource_pack_client_response" | "text" | "set_time" | "start_game" | "add_player" | "add_entity" | "remove_entity" | "add_item_entity" | "take_item_entity" | "move_entity" | "move_player" | "rider_jump" | "update_block" | "add_painting" | "tick_sync" | "level_sound_event_old" | "level_event" | "block_event" | "entity_event" | "mob_effect" | "update_attributes" | "inventory_transaction" | "mob_equipment" | "mob_armor_equipment" | "interact" | "block_pick_request" | "entity_pick_request" | "player_action" | "hurt_armor" | "set_entity_data" | "set_entity_motion" | "set_entity_link" | "set_health" | "set_spawn_position" | "animate" | "respawn" | "container_open" | "container_close" | "player_hotbar" | "inventory_content" | "inventory_slot" | "container_set_data" | "crafting_data" | "crafting_event" | "gui_data_pick_item" | "adventure_settings" | "block_entity_data" | "player_input" | "level_chunk" | "set_commands_enabled" | "set_difficulty" | "change_dimension" | "set_player_game_type" | "player_list" | "simple_event" | "event" | "spawn_experience_orb" | "clientbound_map_item_data" | "map_info_request" | "request_chunk_radius" | "chunk_radius_update" | "item_frame_drop_item" | "game_rules_changed" | "camera" | "boss_event" | "show_credits" | "available_commands" | "command_request" | "command_block_update" | "command_output" | "update_trade" | "update_equipment" | "resource_pack_data_info" | "resource_pack_chunk_data" | "resource_pack_chunk_request" | "transfer" | "play_sound" | "stop_sound" | "set_title" | "add_behavior_tree" | "structure_block_update" | "show_store_offer" | "purchase_receipt" | "player_skin" | "sub_client_login" | "initiate_web_socket_connection" | "set_last_hurt_by" | "book_edit" | "npc_request" | "photo_transfer" | "modal_form_request" | "modal_form_response" | "server_settings_request" | "server_settings_response" | "show_profile" | "set_default_game_type" | "remove_objective" | "set_display_objective" | "set_score" | "lab_table" | "update_block_synced" | "move_entity_delta" | "set_scoreboard_identity" | "set_local_player_as_initialized" | "update_soft_enum" | "network_stack_latency" | "script_custom_event" | "spawn_particle_effect" | "available_entity_identifiers" | "level_sound_event_v2" | "network_chunk_publisher_update" | "biome_definition_list" | "level_sound_event" | "level_event_generic" | "lectern_update" | "video_stream_connect" | "add_ecs_entity" | "remove_ecs_entity" | "client_cache_status" | "on_screen_texture_animation" | "map_create_locked_copy" | "structure_template_data_export_request" | "structure_template_data_export_response" | "update_block_properties" | "client_cache_blob_status" | "client_cache_miss_response" | "education_settings" | "emote" | "multiplayer_settings" | "settings_command" | "anvil_damage" | "completed_using_item" | "network_settings" | "player_auth_input" | "creative_content" | "player_enchant_options" | "item_stack_request" | "item_stack_response" | "player_armor_damage" | "code_builder" | "update_player_game_type" | "emote_list" | "position_tracking_db_broadcast" | "position_tracking_db_request" | "debug_info" | "packet_violation_warning" | "motion_prediction_hints" | "animate_entity" | "camera_shake" | "player_fog" | "correct_player_move_prediction" | "item_component" | "filter_text_packet" | number | "debug_renderer" | "sync_entity_property" | "add_volume_entity" | "remove_volume_entity" | "simulation_type" | "npc_dialogue" | "edu_uri_resource_packet" | "create_photo" | "update_subchunk_blocks" | "photo_info_request" | "subchunk" | "subchunk_request" | "client_start_item_cooldown" | "script_message" | "code_builder_source" | "ticking_areas_load_status" | "dimension_data" | "agent_action" | "change_mob_property" | "lesson_progress" | "request_ability" | "request_permissions" | "toast_request" | "update_abilities" | "update_adventure_settings" | "death_info" | "editor_network" | "feature_registry" | "server_stats" | "request_network_settings" | "game_test_request" | "game_test_results" | "update_client_input_locks" | "client_cheat_ability" | "camera_presets" | "unlocked_recipes" | "camera_instruction" | "compressed_biome_definitions" | "trim_data" | "open_sign" | "agent_animation" | "refresh_entitlements" | "server_post_move" | "toggle_crafter_slot_request" | "set_player_inventory_options" | "set_hud" | "award_achievement" | "clientbound_close_form" | "serverbound_loading_screen" | "jigsaw_structure_data" | "current_structure_feature" | "serverbound_diagnostics" | "camera_aim_assist" | "container_registry_cleanup" | "movement_effect" | "set_movement_authority" | "camera_aim_assist_presets" | "item_registry" | "client_camera_aim_assist" | "client_movement_prediction_sync" | "update_client_options" | "player_video_capture" | "player_update_entity_overrides" | "player_location" | "clientbound_controls_scheme" | "server_script_debug_drawer" | "serverbound_pack_setting_change" | "graphics_override_parameter" | "clientbound_data_store" | "serverbound_data_store" | "clientbound_data_driven_ui_show_screen" | "clientbound_data_driven_ui_close_all_screens" | "clientbound_data_driven_ui_reload" | "clientbound_texture_shift" | "voxel_shapes" | "camera_spline" | "camera_aim_assist_actor_priority" | "clientbound_data_driven_ui_close_screen" | "resource_packs_ready_for_validation" | "locator_bar" | "party_changed" | "serverbound_data_driven_screen_closed" | "sync_world_clocks" | "clientbound_attribute_layer_sync" | "primitive_shapes" | "server_store_info" | "server_presence_info" | "clientbound_update_sound_data" | "send_party_destination_cookie" | "party_destination_cookie_response" | "set_player_furnace_options" | "record_started" | "clientbound_matchmaking_state" | "serverbound_stonecutter_set_recipe" | "clientbound_stonecutter_set_recipe" | "serverbound_matchmaking_cancel" | "set_passenger_of_block" | "serverbound_cursor_item_drag" | "clientbound_play_audio_content" | "serverbound_register_audio_content";
		params?: packet_login | packet_play_status | packet_server_to_client_handshake | packet_client_to_server_handshake | packet_disconnect | packet_resource_packs_info | packet_resource_pack_stack | packet_resource_pack_client_response | packet_text | packet_set_time | packet_start_game | packet_add_player | packet_add_entity | packet_remove_entity | packet_add_item_entity | packet_take_item_entity | packet_move_entity | packet_move_player | packet_rider_jump | packet_update_block | packet_add_painting | packet_tick_sync | packet_level_sound_event_old | packet_level_event | packet_block_event | packet_entity_event | packet_mob_effect | packet_update_attributes | packet_inventory_transaction | packet_mob_equipment | packet_mob_armor_equipment | packet_interact | packet_block_pick_request | packet_entity_pick_request | packet_player_action | packet_hurt_armor | packet_set_entity_data | packet_set_entity_motion | packet_set_entity_link | packet_set_health | packet_set_spawn_position | packet_animate | packet_respawn | packet_container_open | packet_container_close | packet_player_hotbar | packet_inventory_content | packet_inventory_slot | packet_container_set_data | packet_crafting_data | packet_crafting_event | packet_gui_data_pick_item | packet_adventure_settings | packet_block_entity_data | packet_player_input | packet_level_chunk | packet_set_commands_enabled | packet_set_difficulty | packet_change_dimension | packet_set_player_game_type | packet_player_list | packet_simple_event | packet_event | packet_spawn_experience_orb | packet_clientbound_map_item_data | packet_map_info_request | packet_request_chunk_radius | packet_chunk_radius_update | packet_item_frame_drop_item | packet_game_rules_changed | packet_camera | packet_boss_event | packet_show_credits | packet_available_commands | packet_command_request | packet_command_block_update | packet_command_output | packet_update_trade | packet_update_equipment | packet_resource_pack_data_info | packet_resource_pack_chunk_data | packet_resource_pack_chunk_request | packet_transfer | packet_play_sound | packet_stop_sound | packet_set_title | packet_add_behavior_tree | packet_structure_block_update | packet_show_store_offer | packet_purchase_receipt | packet_player_skin | packet_sub_client_login | packet_initiate_web_socket_connection | packet_set_last_hurt_by | packet_book_edit | packet_npc_request | packet_photo_transfer | packet_modal_form_request | packet_modal_form_response | packet_server_settings_request | packet_server_settings_response | packet_show_profile | packet_set_default_game_type | packet_remove_objective | packet_set_display_objective | packet_set_score | packet_lab_table | packet_update_block_synced | packet_move_entity_delta | packet_set_scoreboard_identity | packet_set_local_player_as_initialized | packet_update_soft_enum | packet_network_stack_latency | packet_script_custom_event | packet_spawn_particle_effect | packet_available_entity_identifiers | packet_level_sound_event_v2 | packet_network_chunk_publisher_update | packet_biome_definition_list | packet_level_sound_event | packet_level_event_generic | packet_lectern_update | packet_video_stream_connect | packet_add_ecs_entity | packet_remove_ecs_entity | packet_client_cache_status | packet_on_screen_texture_animation | packet_map_create_locked_copy | packet_structure_template_data_export_request | packet_structure_template_data_export_response | packet_update_block_properties | packet_client_cache_blob_status | packet_client_cache_miss_response | packet_education_settings | packet_emote | packet_multiplayer_settings | packet_settings_command | packet_anvil_damage | packet_completed_using_item | packet_network_settings | packet_player_auth_input | packet_creative_content | packet_player_enchant_options | packet_item_stack_request | packet_item_stack_response | packet_player_armor_damage | packet_code_builder | packet_update_player_game_type | packet_emote_list | packet_position_tracking_db_request | packet_position_tracking_db_broadcast | packet_debug_info | packet_packet_violation_warning | packet_motion_prediction_hints | packet_animate_entity | packet_camera_shake | packet_player_fog | packet_correct_player_move_prediction | packet_item_component | packet_filter_text_packet | packet_debug_renderer | packet_sync_entity_property | packet_add_volume_entity | packet_remove_volume_entity | packet_simulation_type | packet_npc_dialogue | packet_edu_uri_resource_packet | packet_create_photo | packet_update_subchunk_blocks | packet_photo_info_request | packet_subchunk | packet_subchunk_request | packet_client_start_item_cooldown | packet_script_message | packet_code_builder_source | packet_ticking_areas_load_status | packet_dimension_data | packet_agent_action | packet_change_mob_property | packet_lesson_progress | packet_request_ability | packet_request_permissions | packet_toast_request | packet_update_abilities | packet_update_adventure_settings | packet_death_info | packet_editor_network | packet_feature_registry | packet_server_stats | packet_request_network_settings | packet_game_test_request | packet_game_test_results | packet_update_client_input_locks | packet_client_cheat_ability | packet_camera_presets | packet_unlocked_recipes | packet_camera_instruction | packet_compressed_biome_definitions | packet_trim_data | packet_open_sign | packet_agent_animation | packet_refresh_entitlements | packet_toggle_crafter_slot_request | packet_set_player_inventory_options | packet_server_post_move | packet_set_hud | packet_award_achievement | packet_clientbound_close_form | packet_serverbound_loading_screen | packet_jigsaw_structure_data | packet_current_structure_feature | packet_serverbound_diagnostics | packet_camera_aim_assist | packet_container_registry_cleanup | packet_movement_effect | packet_set_movement_authority | packet_camera_aim_assist_presets | packet_item_registry | packet_client_camera_aim_assist | packet_client_movement_prediction_sync | packet_update_client_options | packet_player_video_capture | packet_player_update_entity_overrides | packet_player_location | packet_clientbound_controls_scheme | packet_server_script_debug_drawer | packet_serverbound_pack_setting_change | packet_graphics_override_parameter | packet_clientbound_data_store | packet_serverbound_data_store | packet_clientbound_data_driven_ui_show_screen | packet_clientbound_data_driven_ui_close_all_screens | packet_clientbound_data_driven_ui_reload | packet_clientbound_texture_shift | packet_voxel_shapes | packet_camera_spline | packet_camera_aim_assist_actor_priority | packet_clientbound_data_driven_ui_close_screen | packet_resource_packs_ready_for_validation | packet_locator_bar | packet_party_changed | packet_serverbound_data_driven_screen_closed | packet_sync_world_clocks | packet_clientbound_attribute_layer_sync | packet_primitive_shapes | packet_server_store_info | packet_server_presence_info | packet_clientbound_update_sound_data | packet_send_party_destination_cookie | packet_party_destination_cookie_response | packet_set_player_furnace_options | packet_record_started | packet_clientbound_matchmaking_state | packet_serverbound_stonecutter_set_recipe | packet_clientbound_stonecutter_set_recipe | packet_serverbound_matchmaking_cancel | packet_set_passenger_of_block | packet_serverbound_cursor_item_drag | packet_clientbound_play_audio_content | packet_serverbound_register_audio_content | undefined;
	};
	/**
	 * load the packet map file (auto-generated)
	 * # Login Sequence
	 * The login process is as follows:
	 * 
	 * * C→S: [Login](#packet_login)
	 * * S→C: [Server To Client Handshake](#packet_server_to_client_handshake)
	 * * C→S: [Client To Server Handshake](#packet_client_to_server_handshake)
	 * * S→C: [Play Status (Login success)](#packet_play_status)
	 * * To spawn, the following packets should be sent, in order, after the ones above:
	 * * S→C: [Resource Packs Info](#packet_resource_packs_info)
	 * * C→S: [Resource Pack Client Response](#packet_resource_pack_client_response)
	 * * S→C: [Resource Pack Stack](#packet_resource_pack_stack)
	 * * C→S: [Resource Pack Client Response](#packet_resource_pack_client_response)
	 * * S→C: [Start Game](#packet_start_game)
	 * * S→C: [Item Registry](#packet_item_registry)
	 * * S→C: [Creative Content](#packet_creative_content)
	 * * S→C: [Biome Definition List](#packet_biome_definition_list)
	 * * S→C: [Chunks](#packet_level_chunk)
	 * * S→C: [Play Status (Player spawn)](#packet_play_status)
	 * 
	 * If there are no resource packs being sent, a Resource Pack Stack can be sent directly
	 * after Resource Packs Info to avoid the client responses.
	 * 
	 * ===
	 */
	export type packet_login = {
		/** Protocol version (Big Endian!) */
		protocol_version: number;
		/** The structure of the login tokens has changed in 1.21.90. The encapsulated data is now a JSON object with a stringified `Certificate`. */
		tokens?: LoginTokens | undefined;
	};
	export type LoginTokens = {
		/** JSON array of JWT data: contains the display name, UUID and XUID It should be signed by the Mojang public key For 1.21.90+, the 'identity' field is a Little-Endian length-prefixed JSON-encoded string. This JSON object must contain a 'Certificate' key, whose value is a *stringified* JSON object that holds the actual JWT 'chain' array. */
		identity: LittleString;
		/** JWT containing skin and other client data. */
		client: LittleString;
	};
	export type packet_play_status = {
		status: "login_success" | "failed_client" | "failed_spawn" | "player_spawn" | "failed_invalid_tenant" | "failed_vanilla_edu" | "failed_edu_vanilla" | "failed_server_full" | number | "failed_editor_vanilla_mismatch" | "failed_vanilla_editor_mismatch";
	};
	export type packet_server_to_client_handshake = {
		/** Contains the salt to complete the Diffie-Hellman key exchange */
		token: string;
	};
	/**
	 * Sent by the client in response to a Server To Client Handshake packet
	 * sent by the server. It is the first encrypted packet in the login handshake
	 * and serves as a confirmation that encryption is correctly initialized client side.
	 * It has no fields.
	 */
	export type packet_client_to_server_handshake = Record<string, never>;
	export type packet_disconnect = {
		hide_disconnect_reason: boolean;
		message?: string | undefined;
		/** Versions: 1.20.40 – 1.26.60 */
		reason?: DisconnectFailReason | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		filtered_message?: string | undefined;
	};
	export type packet_resource_packs_info = {
		/** If the resource pack requires the client accept it. */
		must_accept: boolean;
		/** If scripting is enabled. */
		has_scripts: boolean;
		/** Versions: 1.16.201 – 1.21.20 */
		behaviour_packs?: BehaviourPackInfos | undefined;
		/** A list of resource packs that the client needs to download before joining the server. The order of these resource packs is not relevant in this packet. It is however important in the Resource Pack Stack packet. */
		texture_packs: TexturePackInfos;
		/** Versions: 1.17.10 – 1.21.20 */
		force_server_packs?: boolean | undefined;
		/** Versions: 1.20.30 – 1.21.30 */
		resource_pack_links?: {
			id: string;
			url: string;
		}[] | undefined;
		/** HasAddons specifies if any of the resource packs contain addons in them. If set to true, only clients that support addons will be able to download them. Versions: 1.20.71 – 1.26.60 */
		has_addons?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.60 */
		world_template?: {
			/** WorldTemplateUUID is teh UUID of the template that has been used to generate the world. Templates can be downloaded from the marketplace or installed via '.mctemplate' files. If the world was not generated from a template, this field is empty. */
			uuid: string;
			/** WorldTemplateVersion is the version of the world template that has been used to generate the world. If the world was not generated from a template, this field is empty. */
			version: string;
		} | undefined;
		/** ForceDisableVibrantVisuals specifies if the vibrant visuals feature should be forcibly disabled on the server. If set to true, the server will ensure that vibrant visuals are not enabled, regardless of the client's settings. Versions: 1.21.90 – 1.26.60 */
		disable_vibrant_visuals?: boolean | undefined;
	};
	export type packet_resource_pack_stack = {
		/** If the resource pack must be accepted for the player to join the server. */
		must_accept: boolean;
		/** Versions: 1.16.201 – 1.21.124 */
		behavior_packs?: ResourcePackIdVersions | undefined;
		/** [inline] */
		resource_packs: ResourcePackIdVersions;
		game_version: string;
		experiments: Experiments;
		experiments_previously_used: boolean;
		/** Versions: 1.20.80 – 1.26.60 */
		has_editor_packs?: boolean | undefined;
	};
	export type packet_resource_pack_client_response = {
		/** As of 1.26.40 the status is an unsigned varint and no longer includes the 'none' entry. It is followed by the same status as a string, and the pack IDs are only written for 'send_packs'. */
		response_status: "none" | "refused" | "send_packs" | "have_all_packs" | "completed" | number;
		/** All of the pack IDs. */
		resourcepackids?: ResourcePackIds | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		response_status_name?: string | undefined;
	};
	/**
	 * Sent by the client to the server to send chat messages, and by the server to the client
	 * to forward or send messages, which may be chat, popups, tips etc.
	 * # https://github.com/pmmp/PocketMine-MP/blob/a43b46a93cb127f037c879b5d8c29cda251dd60c/src/pocketmine/network/mcpe/protocol/TextPacket.php
	 * # https://github.com/Sandertv/gophertunnel/blob/05ac3f843dd60d48b9ca0ab275cda8d9e85d8c43/minecraft/protocol/packet/text.go
	 */
	export type packet_text = {
		/** TextType is the type of the text sent. */
		type: "raw" | "chat" | "translation" | "popup" | "jukebox_popup" | "tip" | "system" | "whisper" | "announcement" | "json_whisper" | "json" | number | "json_announcement";
		/** NeedsTranslation specifies if any of the messages need to be translated. */
		needs_translation: boolean;
		source_name?: string | undefined;
		message?: string | undefined;
		parameters?: string[] | undefined;
		xuid: string;
		platform_chat_id: string;
		/** Versions: 1.21.0 – 1.26.60 */
		filtered_message?: string | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		category?: "message_only" | "authored" | "parameters" | number | undefined;
		/** Versions: 1.21.130 */
		raw?: string | undefined;
		/** Versions: 1.21.130 */
		tip?: string | undefined;
		/** Versions: 1.21.130 */
		system_message?: string | undefined;
		/** Versions: 1.21.130 */
		text_object_whisper?: string | undefined;
		/** Versions: 1.21.130 */
		text_object_announcement?: string | undefined;
		/** Versions: 1.21.130 */
		text_object?: string | undefined;
		/** Versions: 1.21.130 */
		chat?: string | undefined;
		/** Versions: 1.21.130 */
		whisper?: string | undefined;
		/** Versions: 1.21.130 */
		announcement?: string | undefined;
		/** Versions: 1.21.130 */
		translate?: string | undefined;
		/** Versions: 1.21.130 */
		popup?: string | undefined;
		/** Versions: 1.21.130 */
		jukebox_popup?: string | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		has_filtered_message?: boolean | undefined;
	};
	/**
	 * For additional information and examples of all the chat types above, see here: https://imgur.com/a/KhcFscg
	 * Sent by the server to update the current time client-side. The client actually advances time
	 * client-side by itself, so this packet does not need to be sent each tick. It is merely a means
	 * of synchronizing time between server and client.
	 */
	export type packet_set_time = {
		/** Time is the current time. The time is not limited to 24000 (time of day), but continues progressing after that. */
		time: number;
	};
	/**
	 * Sent by the server to send information about the world the player will be spawned in.
	 */
	export type packet_start_game = {
		/** The unique ID of the player. The unique ID is a value that remains consistent across different sessions of the same world, but most unofficial servers simply fill the runtime ID of the entity out for this field. */
		entity_id: bigint | number;
		/** The runtime ID of the player. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_entity_id: bigint | number;
		/** PlayerGameMode is the game mode the player currently has. It is a value from 0-4, with 0 being survival mode, 1 being creative mode, 2 being adventure mode, 3 being survival spectator and 4 being creative spectator. This field may be set to 5 to make the client fall back to the game mode set in the WorldGameMode field. */
		player_gamemode: GameMode;
		/** Versions: 1.16.201 */
		spawn?: vec3f | undefined;
		/** The pitch and yaw of the player */
		rotation: vec2f;
		/** The seed used to generate the world. */
		seed: number | Int64Write;
		biome_type: number;
		biome_name: string;
		/** Dimension is the ID of the dimension that the player spawns in. It is a value from 0-2, with 0 being the overworld, 1 being the nether and 2 being the end. */
		dimension: number | "overworld" | "nether" | "end";
		/** Generator is the generator used for the world. It is a value from 0-4, with 0 being old limited worlds, 1 being infinite worlds, 2 being flat worlds, 3 being nether worlds and 4 being end worlds. A value of 0 will actually make the client stop rendering chunks you send beyond the world limit. As of 1.21.80, protocol.PlayerMovementModeServer is the minimum requirement for MovementType. */
		generator: number;
		/** The world game mode that a player gets when it first spawns in the world. It is shown in the settings and is used if the Player Gamemode is set to 5. */
		world_gamemode: GameMode;
		/** Difficulty is the difficulty of the world. It is a value from 0-3, with 0 being peaceful, 1 being easy, 2 being normal and 3 being hard. */
		difficulty: number;
		/** The block on which the world spawn of the world. This coordinate has no effect on the place that the client spawns, but it does have an effect on the direction that a compass poInts. */
		spawn_position: BlockCoordinates;
		/** Defines if achievements are disabled in the world. The client crashes if this value is set to true while the player's or the world's game mode is creative, and it's recommended to simply always set this to false as a server. */
		achievements_disabled: boolean;
		/** The time at which the day cycle was locked if the day cycle is disabled using the respective game rule. The client will maIntain this time as Boolean as the day cycle is disabled. */
		day_cycle_stop_time: number;
		/** Some Minecraft: Education Edition field that specifies what 'region' the world was from, with 0 being None, 1 being RestOfWorld, and 2 being China. The actual use of this field is unknown. As of 1.26.40 this is an unsigned varint. */
		edu_offer: number;
		/** Specifies if the world has education edition features enabled, such as the blocks or entities specific to education edition. */
		edu_features_enabled: boolean;
		edu_product_uuid: string;
		/** The level specifying the Intensity of the rain falling. When set to 0, no rain falls at all. */
		rain_level: number;
		lightning_level: number;
		/** The level specifying the Intensity of the thunder. This may actually be set independently from the rain level, meaning dark clouds can be produced without rain. */
		has_confirmed_platform_locked_content: boolean;
		/** Specifies if the world is a multi-player game. This should always be set to true for servers. */
		is_multiplayer: boolean;
		/** Specifies if LAN broadcast was Intended to be enabled for the world. */
		broadcast_to_lan: boolean;
		/** The mode used to broadcast the joined game across XBOX Live. */
		xbox_live_broadcast_mode: number;
		/** The mode used to broadcast the joined game across the platform. */
		platform_broadcast_mode: number;
		/** If commands are enabled for the player. It is recommended to always set this to true on the server, as setting it to false means the player cannot, under any circumstance, use a command. */
		enable_commands: boolean;
		/** Specifies if the texture pack the world might hold is required, meaning the client was forced to download it before joining. */
		is_texturepacks_required: boolean;
		/** Defines game rules currently active with their respective values. The value of these game rules may be either 'bool', 'Int32' or 'Float32'. Some game rules are server side only, and don't necessarily need to be sent to the client. As of 1.26.40 StartGame uses the same game rule encoding as the rest of the protocol (int values are little endian ints instead of varints). */
		gamerules: GameRules | GameRuleVarint[] | GameRuleI32[];
		experiments: Experiments;
		experiments_previously_used: boolean;
		/** Specifies if the world had the bonus map setting enabled when generating it. It does not have any effect client-side. */
		bonus_chest: boolean;
		/** Specifies if the world has the start with map setting enabled, meaning each joining player obtains a map. This should always be set to false, because the client obtains a map all on its own accord if this is set to true. */
		map_enabled: boolean;
		/** The permission level of the player. It is a value from 0-3, with 0 being visitor, 1 being member, 2 being operator and 3 being custom. */
		permission_level: number | PermissionLevel;
		/** The radius around the player in which chunks are ticked. Most servers set this value to a fixed number, as it does not necessarily affect anything client-side. */
		server_chunk_tick_range: number;
		/** Specifies if the texture pack of the world is locked, meaning it cannot be disabled from the world. This is typically set for worlds on the marketplace that have a dedicated texture pack. */
		has_locked_behavior_pack: boolean;
		/** Specifies if the texture pack of the world is locked, meaning it cannot be disabled from the world. This is typically set for worlds on the marketplace that have a dedicated texture pack. */
		has_locked_resource_pack: boolean;
		/** Specifies if the world from the server was from a locked world template. For servers this should always be set to false. */
		is_from_locked_world_template: boolean;
		msa_gamertags_only: boolean;
		/** Specifies if the world from the server was from a locked world template. For servers this should always be set to false. */
		is_from_world_template: boolean;
		/** Specifies if the world was a template that locks all settings that change properties above in the settings GUI. It is recommended to set this to true for servers that do not allow things such as setting game rules through the GUI. */
		is_world_template_option_locked: boolean;
		/** A hack that Mojang put in place to preserve backwards compatibility with old villagers. The his never actually read though, so it has no functionality. */
		only_spawn_v1_villagers: boolean;
		/** The version of the game from which Vanilla features will be used. The exact function of this field isn't clear. */
		game_version: string;
		limited_world_width: number;
		limited_world_length: number;
		is_new_nether: boolean;
		experimental_gameplay_override: boolean;
		/** A base64 encoded world ID that is used to identify the world. */
		level_id: string;
		/** The name of the world that the player is joining. Note that this field shows up above the player list for the rest of the game session, and cannot be changed. Setting the server name to this field is recommended. */
		world_name: string;
		/** A UUID specific to the premium world template that might have been used to generate the world. Servers should always fill out an empty String for this. */
		premium_world_template_id: string;
		/** Specifies if the world was a trial world, meaning features are limited and there is a time limit on the world. */
		is_trial: boolean;
		/** Versions: 1.16.201 – 1.21.80 */
		movement_authority?: "client" | "server" | "server_v2_rewind" | number | "server_with_rewind" | undefined;
		current_tick: Int64Write;
		enchantment_seed: number;
		/** Versions: 1.16.201 – 1.16.210 */
		block_palette?: BlockPalette | undefined;
		/** Versions: 1.16.201 – 1.21.50 */
		itemstates?: Itemstates | undefined;
		multiplayer_correlation_id: string;
		server_authoritative_inventory: boolean;
		/** The spawn position of the player in the world. In servers this is often the same as the world's spawn position found below. Versions: 1.16.210 – 1.26.60 */
		player_position?: vec3f | undefined;
		/** RewindHistorySize is the amount of history to keep at maximum Versions: 1.16.210 – 1.26.60 */
		rewind_history_size?: number | undefined;
		/** ServerAuthoritativeBlockBreaking specifies if block breaking should be sent through packet.PlayerAuthInput or not. This field is somewhat redundant as it is always enabled if server authoritative movement is enabled. Versions: 1.16.210 – 1.26.60 */
		server_authoritative_block_breaking?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		block_properties?: BlockProperties | undefined;
		/** Versions: 1.17.0 – 1.26.60 */
		engine?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		edu_resource_uri?: EducationSharedResourceURI | undefined;
		/** Versions: 1.18.0 – 1.18.30 */
		block_pallete_checksum?: Int64Write | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		property_data?: NBT | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		block_pallette_checksum?: Int64Write | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		world_template_id?: string | undefined;
		/** Versions: 1.19.10 – 1.20.10 */
		editor_world?: boolean | undefined;
		/** PersonaDisabled is true if persona skins are disabled for the current game session. Versions: 1.19.20 – 1.26.60 */
		persona_disabled?: boolean | undefined;
		/** CustomSkinsDisabled is true if custom skins are disabled for the current game session. Versions: 1.19.20 – 1.26.60 */
		custom_skins_disabled?: boolean | undefined;
		/** ChatRestrictionLevel specifies the level of restriction on in-game chat. Versions: 1.19.20 – 1.26.60 */
		chat_restriction_level?: "none" | "dropped" | "disabled" | number | undefined;
		/** DisablePlayerInteractions is true if the client should ignore other players when interacting with the world. Versions: 1.19.20 – 1.26.60 */
		disable_player_interactions?: boolean | undefined;
		/** Versions: 1.19.20 – 1.26.60 */
		client_side_generation?: boolean | undefined;
		/** EmoteChatMuted specifies if players will be sent a chat message when using certain emotes. Versions: 1.19.60 – 1.26.60 */
		emote_chat_muted?: boolean | undefined;
		/** Whether the world was created in editor mode Versions: 1.19.80 – 1.26.60 */
		created_in_editor?: boolean | undefined;
		/** Whether the world was exported from editor mode Versions: 1.19.80 – 1.26.60 */
		exported_from_editor?: boolean | undefined;
		/** Versions: 1.19.80 – 1.26.60 */
		block_network_ids_are_hashes?: boolean | undefined;
		/** Versions: 1.20.0 – 1.26.60 */
		server_controlled_sound?: boolean | undefined;
		/** EditorWorldType is a value to dictate the type of editor mode, a special mode recently introduced adding "powerful tools for editing worlds, intended for experienced creators." Versions: 1.20.30 – 1.26.60 */
		editor_world_type?: "not_editor" | "project" | "test_level" | number | "realms_upload" | undefined;
		/** Specifies if the game is locked to "hardcore" mode or not, meaning the world will be unplayable after player dies in survival game mode. Persists even after switching player or world game modes. Versions: 1.20.80 – 1.26.60 */
		hardcore?: boolean | undefined;
		/** Versions: 1.21.0 – 1.26.60 */
		server_identifier?: string | undefined;
		/** Versions: 1.21.0 – 1.26.60 */
		world_identifier?: string | undefined;
		/** Versions: 1.21.0 – 1.26.60 */
		scenario_identifier?: string | undefined;
		/** Versions: 1.21.90 – 1.26.60 */
		owner_identifier?: string | undefined;
		/** Versions: 1.21.100 – 1.21.124 */
		tick_death_systems?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		has_server_join_info?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		server_join_info?: ServerJoinInformation | undefined;
		/** ServerEditorConnectionPolicy controls the editor connection policy. Versions: 1.26.30 – 1.26.60 */
		server_editor_connection_policy?: number | undefined;
		/** AllowAnonymousBlockDropsInEditorWorlds specifies if anonymous block Versions: 1.26.30 – 1.26.60 */
		allow_anonymous_block_drops_in_editor_worlds?: boolean | undefined;
		/** Versions: 1.26.30 */
		is_chat_logging?: boolean | undefined;
		/** Versions: 1.26.60 */
		editor_level_migration_version?: "legacy" | "editor_achievements" | number | undefined;
	};
	export type packet_add_player = {
		/** UUID is the UUID of the player. It is the same UUID that the client sent in the Login packet at the start of the session. A player with this UUID must exist in the player list (built up using the Player List packet) for it to show up in-game. */
		uuid: string;
		/** Username is the name of the player. This username is the username that will be set as the initial name tag of the player. */
		username: string;
		/** Versions: 1.16.201 – 1.18.11 */
		entity_id_self?: bigint | number | undefined;
		/** Versions: 1.16.201 – 1.19.1 */
		runtime_entity_id?: number | bigint | number | undefined;
		/** An identifier only set for particular platforms when chatting (presumably only for Nintendo Switch). It is otherwise an empty string, and is used to decide which players are able to chat with each other. */
		platform_chat_id: string;
		/** Versions: 1.16.201 – 1.16.210 */
		x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		z?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_z?: number | undefined;
		/** Pitch is the vertical rotation of the player. Facing straight forward yields a pitch of 0. Pitch is measured in degrees. */
		pitch: number;
		/** Yaw is the horizontal rotation of the player. Yaw is also measured in degrees. */
		yaw: number;
		/** HeadYaw is the same as Yaw, except that it applies specifically to the head of the player. A different value for HeadYaw than Yaw means that the player will have its head turned. */
		head_yaw: number;
		/** HeldItem is the item that the player is holding. The item is shown to the viewer as soon as the player itself shows up. Needless to say that this field is rather pointless, as additional packets still must be sent for armour to show up. */
		held_item: Item | ItemV4;
		/** EntityMetadata is a map of entity metadata, which includes flags and data properties that alter in particular the way the player looks. Flags include ones such as 'on fire' and 'sprinting'. The metadata values are indexed by their property key. */
		metadata: MetadataDictionary;
		/** Versions: 1.16.201 – 1.19.1 */
		flags?: number | undefined;
		command_permission: number | CommandPermissionLevel;
		/** Versions: 1.16.201 – 1.19.1 */
		action_permissions?: number | undefined;
		permission_level: number | PermissionLevel;
		/** Versions: 1.16.201 – 1.19.1 */
		custom_stored_permissions?: number | undefined;
		/** Versions: 1.16.201 – 1.19.1 */
		user_id?: Int64Write | undefined;
		/** EntityLinks is a list of entity links that are currently active on the player. These links alter the way the player shows up when first spawned in terms of it shown as riding an entity. Setting these links is important for new viewers to see the player is riding another entity. */
		links: Links;
		/** DeviceID is the device ID set in one of the files found in the storage of the device of the player. It may be changed freely, so it should not be relied on for anything. */
		device_id: string;
		/** BuildPlatform is the build platform/device OS of the player that is about to be added, as it sent in the Login packet when joining. */
		device_os?: number | DeviceOS | undefined;
		/** Position is the position to spawn the player on. If the player is on a distance that the viewer cannot see it, the player will still show up if the viewer moves closer. Versions: 1.16.220 – 1.26.60 */
		position?: vec3f | undefined;
		/** Velocity is the initial velocity the player spawns with. This velocity will initiate client side movement of the player. Versions: 1.16.220 – 1.26.60 */
		velocity?: vec3f | undefined;
		/** Versions: 1.18.30 – 1.19.1 */
		unique_entity_id?: bigint | number | undefined;
		/** GameType is the game type of the player. If set to GameTypeSpectator, the player will not be shown to viewers. Versions: 1.18.30 – 1.26.60 */
		gamemode?: GameMode | undefined;
		/** The runtime ID of the player. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.19.10 – 1.26.60 */
		runtime_id?: bigint | number | undefined;
		/** The unique ID of the player. The unique ID is a value that remains consistent across different sessions of the same world, but most unoffical servers simply fill the runtime ID of the player out for this field. Versions: 1.19.10 – 1.26.60 */
		unique_id?: Int64Write | undefined;
		/** AbilityLayer represents the abilities of a specific layer, such as the base layer or the spectator layer. Versions: 1.19.10 – 1.26.60 */
		abilities?: AbilityLayers[] | undefined;
		/** EntityProperties holds lists of entity properties that define specific attributes of an entity. As of v1.19.40, the vanilla server does not use these properties, however they are still supported by the protocol. Versions: 1.19.40 – 1.26.60 */
		properties?: EntityProperties | undefined;
		/** Versions: 1.26.60 */
		passenger_of_block?: PassengerOfBlockData | undefined;
	};
	export type packet_add_entity = {
		/** Versions: 1.16.201 – 1.19.1 */
		entity_id_self?: bigint | number | undefined;
		/** Versions: 1.16.201 – 1.19.1 */
		runtime_entity_id?: number | bigint | number | undefined;
		/** EntityType is the string entity type of the entity, for example 'minecraft:skeleton'. A list of these entities may be found online. */
		entity_type: string;
		/** Versions: 1.16.201 – 1.16.210 */
		x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		z?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_z?: number | undefined;
		/** Pitch is the vertical rotation of the entity. Facing straight forward yields a pitch of 0. Pitch is measured in degrees. */
		pitch: number;
		/** Yaw is the horizontal rotation of the entity. Yaw is also measured in degrees. */
		yaw: number;
		/** HeadYaw is the same as Yaw, except that it applies specifically to the head of the entity. A different value for HeadYaw than Yaw means that the entity will have its head turned. */
		head_yaw: number;
		/** Attributes is a slice of attributes that the entity has. It includes attributes such as its health, movement speed, etc. */
		attributes: EntityAttributes;
		/** EntityMetadata is a map of entity metadata, which includes flags and data properties that alter in particular the way the entity looks. Flags include ones such as 'on fire' and 'sprinting'. The metadata values are indexed by their property key. */
		metadata: MetadataDictionary;
		/** EntityLinks is a list of entity links that are currently active on the entity. These links alter the way the entity shows up when first spawned in terms of it shown as riding an entity. Setting these links is important for new viewers to see the entity is riding another entity. */
		links: Links;
		/** Position is the position to spawn the entity on. If the entity is on a distance that the player cannot see it, the entity will still show up if the player moves closer. Versions: 1.16.220 – 1.26.60 */
		position?: vec3f | undefined;
		/** Velocity is the initial velocity the entity spawns with. This velocity will initiate client side movement of the entity. Versions: 1.16.220 – 1.26.60 */
		velocity?: vec3f | undefined;
		/** EntityUniqueID is the unique ID of the entity. The unique ID is a value that remains consistent across different sessions of the same world, but most servers simply fill the runtime ID of the entity out for Versions: 1.19.10 – 1.26.60 */
		unique_id?: bigint | number | undefined;
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.19.10 – 1.26.60 */
		runtime_id?: bigint | number | undefined;
		/** BodyYaw is the same as Yaw, except that it applies specifically to the body of the entity. A different value for BodyYaw than HeadYaw means that the entity will have its body turned, although it is unclear what the difference between BodyYaw and Yaw is. Versions: 1.19.10 – 1.26.60 */
		body_yaw?: number | undefined;
		/** EntityProperties holds lists of entity properties that define specific attributes of an entity. As of v1.19.40, the vanilla server does not use these properties, however they are still supported by the protocol. Versions: 1.19.40 – 1.26.60 */
		properties?: EntityProperties | undefined;
		/** Versions: 1.26.60 */
		passenger_of_block?: PassengerOfBlockData | undefined;
	};
	export type packet_remove_entity = {
		entity_id_self: bigint | number;
	};
	export type packet_add_item_entity = {
		entity_id_self: bigint | number;
		runtime_entity_id: number | bigint | number;
		item: Item | ItemV4;
		/** Versions: 1.16.201 – 1.16.210 */
		x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		z?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		speed_z?: number | undefined;
		metadata: MetadataDictionary;
		is_from_fishing: boolean;
		/** Versions: 1.16.220 – 1.26.60 */
		position?: vec3f | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		velocity?: vec3f | undefined;
	};
	export type packet_take_item_entity = {
		runtime_entity_id: number | bigint | number;
		target: number;
	};
	/**
	 * MoveActorAbsolute is sent by the server to move an entity to an absolute position. It is typically used
	 * for movements where high accuracy isn't needed, such as for long range teleporting.
	 */
	export type packet_move_entity = {
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_entity_id: number | bigint | number;
		/** Flags is a combination of flags that specify details of the movement. It is a combination of the flags above. */
		flags: number;
		/** Position is the position to spawn the entity on. If the entity is on a distance that the player cannot see it, the entity will still show up if the player moves closer. */
		position: vec3f;
		/** Rotation is a Vec3 holding the X, Y and Z rotation of the entity after the movement. This is a Vec3 for the reason that projectiles like arrows don't have yaw/pitch, but do have roll. */
		rotation: Rotation;
	};
	/**
	 * MovePlayer is sent by players to send their movement to the server, and by the server to update the
	 * movement of player entities to other players.
	 */
	export type packet_move_player = {
		/** EntityRuntimeID is the runtime ID of the player. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_id: number;
		/** Position is the position to spawn the player on. If the player is on a distance that the viewer cannot see it, the player will still show up if the viewer moves closer. */
		position: vec3f;
		/** Pitch is the vertical rotation of the player. Facing straight forward yields a pitch of 0. Pitch is measured in degrees. */
		pitch: number;
		/** Yaw is the horizontal rotation of the player. Yaw is also measured in degrees */
		yaw: number;
		/** HeadYaw is the same as Yaw, except that it applies specifically to the head of the player. A different value for HeadYaw than Yaw means that the player will have its head turned */
		head_yaw: number;
		/** Mode is the mode of the movement. It specifies the way the player's movement should be shown to other players. It is one of the constants below. */
		mode: "normal" | "reset" | "teleport" | "rotation" | number;
		/** OnGround specifies if the player is considered on the ground. Note that proxies or hacked clients could fake this to always be true, so it should not be taken for granted. */
		on_ground: boolean;
		/** RiddenEntityRuntimeID is the runtime ID of the entity that the player might currently be riding. If not riding, this should be left 0. */
		ridden_runtime_id: number;
		teleport?: {
			cause: "unknown" | "projectile" | "chorus_fruit" | "command" | "behavior" | number;
			source_entity_type: LegacyEntityType;
		} | undefined;
		tick: bigint | number;
	};
	/**
	 * Removed in 1.21.80
	 */
	export type packet_rider_jump = {
		jump_strength: number;
	};
	/**
	 * UpdateBlock is sent by the server to update a block client-side, without resending the entire chunk that
	 * the block is located in. It is particularly useful for small modifications like block breaking/placing.
	 */
	export type packet_update_block = {
		/** Versions: 1.16.201 */
		coordinates?: BlockCoordinates | undefined;
		/** NewBlockRuntimeID is the runtime ID of the block that is placed at Position after sending the packet to the client. */
		block_runtime_id: number;
		/** Versions: 1.16.201 */
		block_priority?: number | undefined;
		/** Versions: 1.16.201 */
		storage?: number | undefined;
		/** Position is the block position at which a block is updated. Versions: 1.16.210 – 1.26.60 */
		position?: BlockCoordinates | undefined;
		/** Flags is a combination of flags that specify the way the block is updated client-side. It is a combination of the flags above, but typically sending only the BlockUpdateNetwork flag is sufficient. Versions: 1.16.210 – 1.26.60 */
		flags?: UpdateBlockFlags | undefined;
		/** Layer is the world layer on which the block is updated. For most blocks, this is the first layer, as that layer is the default layer to place blocks on, but for blocks inside of each other, this differs. Versions: 1.16.210 – 1.26.60 */
		layer?: number | undefined;
	};
	export type packet_add_painting = {
		entity_id_self: bigint | number;
		runtime_entity_id: number | bigint | number;
		coordinates: BlockCoordinates | vec3f;
		direction: number;
		title: string;
	};
	/**
	 * TickSync is sent by the client and the server to maintain a synchronized, server-authoritative tick between
	 * the client and the server. The client sends this packet first, and the server should reply with another one
	 * of these packets, including the response time.
	 */
	export type packet_tick_sync = {
		/** ClientRequestTimestamp is the timestamp on which the client sent this packet to the server. The server should fill out that same value when replying. The ClientRequestTimestamp is always 0 */
		request_time: Int64Write;
		/** ServerReceptionTimestamp is the timestamp on which the server received the packet sent by the client. When the packet is sent by the client, this value is 0. ServerReceptionTimestamp is generally the current tick of the server. It isn't an actual timestamp, as the field implies */
		response_time: Int64Write;
	};
	export type packet_level_sound_event_old = {
		sound_id: number;
		position: vec3f;
		block_id: number;
		entity_type: number;
		is_baby_mob: boolean;
		is_global: boolean;
	};
	/**
	 * TODO: Check and verify old versions
	 */
	export type packet_level_event = {
		event: "sound_click" | "sound_click_fail" | "sound_shoot" | "sound_door" | "sound_fizz" | "sound_ignite" | "sound_ghast" | "sound_ghast_shoot" | "sound_blaze_shoot" | "sound_door_bump" | "sound_door_crash" | "sound_enderman_teleport" | "sound_anvil_break" | "sound_anvil_use" | "sound_anvil_fall" | "sound_pop" | "sound_portal" | "sound_itemframe_add_item" | "sound_itemframe_remove" | "sound_itemframe_place" | "sound_itemframe_remove_item" | "sound_itemframe_rotate_item" | "sound_camera" | "sound_orb" | "sound_totem" | "sound_armor_stand_break" | "sound_armor_stand_hit" | "sound_armor_stand_fall" | "sound_armor_stand_place" | "particle_shoot" | "particle_destroy" | "particle_splash" | "particle_eye_despawn" | "particle_spawn" | "guardian_curse" | "particle_block_force_field" | "particle_projectile_hit" | "particle_enderman_teleport" | "particle_punch_block" | "start_rain" | "start_thunder" | "stop_rain" | "stop_thunder" | "pause_game" | "pause_game_no_screen" | "set_game_speed" | "redstone_trigger" | "cauldron_explode" | "cauldron_dye_armor" | "cauldron_clean_armor" | "cauldron_fill_potion" | "cauldron_take_potion" | "cauldron_fill_water" | "cauldron_take_water" | "cauldron_add_dye" | "cauldron_clean_banner" | "block_start_break" | "block_stop_break" | "set_data" | "players_sleeping" | "add_particle_mask" | number | "pointed_dripstone_land" | "dye_used" | "ink_sack_used" | "particle_crop_growth" | "particle_guardian_curse" | "particle_death_smoke" | "particle_dragon_egg_teleport" | "particle_crop_eaten" | "particle_critical" | "particle_bubble" | "particle_evaporate" | "particle_destroy_armor_stand" | "particle_breaking_egg" | "particle_destroy_egg" | "particle_evaporate_water" | "particle_destroy_block_no_sound" | "particle_knockback_roar" | "particle_teleport_trail" | "particle_point_cloud" | "particle_explosion" | "particle_block_explosion" | "particle_vibration_signal" | "particle_dripstone_drip" | "particle_fizz_effect" | "particle_wax_on" | "particle_wax_off" | "particle_scrape" | "particle_electric_spark" | "add_particle_bubble" | "add_particle_bubble_manual" | "add_particle_critical" | "add_particle_block_force_field" | "add_particle_smoke" | "add_particle_explode" | "add_particle_evaporation" | "add_particle_flame" | "add_particle_candle_flame" | "add_particle_lava" | "add_particle_large_smoke" | "add_particle_redstone" | "add_particle_rising_red_dust" | "add_particle_item_break" | "add_particle_snowball_poof" | "add_particle_huge_explode" | "add_particle_huge_explode_seed" | "add_particle_mob_flame" | "add_particle_heart" | "add_particle_terrain" | "add_particle_town_aura" | "add_particle_portal" | "add_particle_water_splash" | "add_particle_water_splash_manual" | "add_particle_water_wake" | "add_particle_drip_water" | "add_particle_drip_lava" | "add_particle_drip_honey" | "add_particle_stalactite_drip_water" | "add_particle_stalactite_drip_lava" | "add_particle_falling_dust" | "add_particle_mob_spell" | "add_particle_mob_spell_ambient" | "add_particle_mob_spell_instantaneous" | "add_particle_ink" | "add_particle_slime" | "add_particle_rain_splash" | "add_particle_villager_angry" | "add_particle_villager_happy" | "add_particle_enchantment_table" | "add_particle_tracking_emitter" | "add_particle_note" | "add_particle_witch_spell" | "add_particle_carrot" | "add_particle_mob_appearance" | "add_particle_end_rod" | "add_particle_dragons_breath" | "add_particle_spit" | "add_particle_totem" | "add_particle_food" | "add_particle_fireworks_starter" | "add_particle_fireworks_spark" | "add_particle_fireworks_overlay" | "add_particle_balloon_gas" | "add_particle_colored_flame" | "add_particle_sparkler" | "add_particle_conduit" | "add_particle_bubble_column_up" | "add_particle_bubble_column_down" | "add_particle_sneeze" | "add_particle_shulker_bullet" | "add_particle_bleach" | "add_particle_dragon_destroy_block" | "add_particle_mycelium_dust" | "add_particle_falling_red_dust" | "add_particle_campfire_smoke" | "add_particle_tall_campfire_smoke" | "add_particle_dragon_breath_fire" | "add_particle_dragon_breath_trail" | "add_particle_blue_flame" | "add_particle_soul" | "add_particle_obsidian_tear" | "add_particle_portal_reverse" | "add_particle_snowflake" | "add_particle_vibration_signal" | "add_particle_sculk_sensor_redstone" | "add_particle_spore_blossom_shower" | "add_particle_spore_blossom_ambient" | "add_particle_wax" | "add_particle_electric_spark" | "particle_turtle_egg" | "particle_sculk_shriek" | "sculk_catalyst_bloom" | "sleeping_players" | "sculk_charge" | "sculk_charge_pop" | "sonic_explosion" | "block_break_speed" | "particle_punch_block_down" | "particle_punch_block_up" | "particle_punch_block_north" | "particle_punch_block_south" | "particle_punch_block_west" | "particle_punch_block_east" | "dust_plume" | "particle_shoot_white_smoke" | "particle_wind_explosion" | "particle_trial_spawner_detection" | "particle_trial_spawner_spawning" | "particle_trial_spawner_ejecting" | "jump_prevented" | "particle_breeze_wind_explosion" | "animation_vault_activate" | "animation_vault_deactivate" | "animation_vault_eject_item" | "particle_wolf_armor_break" | "animation_spawn_cobweb" | "add_particle_smash_attack_ground_dust" | "add_particle_creaking_heart_trail" | "ominous_item_spawner" | "creaking_crumble" | "pale_oak_leaves" | "eyeblossom_open" | "eyeblossom_close" | "green_flame" | "add_particle_ice_ball_break";
		position: vec3f;
		data: number;
	};
	export type packet_block_event = {
		/** Position is the position of the block that an event occurred at. */
		position: BlockCoordinates;
		/** EventType is the type of the block event. The event type decides the way the event data that follows is used */
		type: "sound" | "change_state" | number;
		/** EventData holds event type specific data. For chests for example, opening the chest means the data must be 1 */
		data: number;
	};
	export type packet_entity_event = {
		runtime_entity_id: number | bigint | number;
		event_id: "jump" | "hurt_animation" | "death_animation" | "arm_swing" | "stop_attack" | "tame_fail" | "tame_success" | "shake_wet" | "use_item" | "eat_grass_animation" | "fish_hook_bubble" | "fish_hook_position" | "fish_hook_hook" | "fish_hook_tease" | "squid_ink_cloud" | "zombie_villager_cure" | "respawn" | "iron_golem_offer_flower" | "iron_golem_withdraw_flower" | "love_particles" | "villager_angry" | "villager_happy" | "witch_spell_particles" | "firework_particles" | "in_love_particles" | "silverfish_spawn_animation" | "guardian_attack" | "witch_drink_potion" | "witch_throw_potion" | "minecart_tnt_prime_fuse" | "creeper_prime_fuse" | "air_supply_expired" | "player_add_xp_levels" | "elder_guardian_curse" | "agent_arm_swing" | "ender_dragon_death" | "dust_particles" | "arrow_shake" | "eating_item" | "baby_animal_feed" | "death_smoke_cloud" | "complete_trade" | "remove_leash" | "consume_totem" | "player_check_treasure_hunter_achievement" | "entity_spawn" | "dragon_puke" | "item_entity_merge" | "start_swim" | "balloon_pop" | "treasure_hunt" | "agent_summon" | "charged_item" | "fall" | number | "caravan" | "grow_up" | "vibration_detected" | "drink_milk" | "wetness_stop" | "kinetic_damage_dealt" | "hurt_without_receiving_damage";
		data: number;
		/** Versions: 1.26.20 – 1.26.60 */
		fire_at_position?: vec3f | undefined;
	};
	export type packet_mob_effect = {
		runtime_entity_id: number | bigint | number;
		event_id: "add" | "update" | "remove" | number;
		effect_id: number;
		amplifier: number;
		particles: boolean;
		duration: number;
		/** Versions: 1.20.71 – 1.26.60 */
		tick?: Int64Write | bigint | number | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		ambient?: boolean | undefined;
	};
	export type packet_update_attributes = {
		runtime_entity_id: bigint | number;
		attributes: PlayerAttributes;
		tick: bigint | number;
	};
	/**
	 * InventoryTransaction is a packet sent by the client. It essentially exists out of multiple sub-packets,
	 * each of which have something to do with the inventory in one way or another. Some of these sub-packets
	 * directly relate to the inventory, others relate to interaction with the world, that could potentially
	 * result in a change in the inventory.
	 */
	export type packet_inventory_transaction = {
		transaction: Transaction;
	};
	export type packet_mob_equipment = {
		runtime_entity_id: number | bigint | number;
		item: Item | ItemV4;
		slot: number;
		selected_slot: number;
		/** Versions: 1.16.201 */
		windows_id?: WindowID | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		window_id?: WindowID | undefined;
	};
	export type packet_mob_armor_equipment = {
		runtime_entity_id: number | bigint | number;
		helmet: Item | ItemV4;
		chestplate: Item | ItemV4;
		leggings: Item | ItemV4;
		boots: Item | ItemV4;
		/** Versions: 1.21.20 – 1.26.60 */
		body?: Item | ItemV4 | undefined;
	};
	/**
	 * Interact is sent by the client when it interacts with another entity in some way. It used to be used for
	 * normal entity and block interaction, but this is no longer the case now.
	 */
	export type packet_interact = {
		/** Action type is the ID of the action that was executed by the player. It is one of the constants that may be found above. */
		action_id: "leave_vehicle" | "mouse_over_entity" | "npc_open" | "open_inventory" | number;
		/** Versions: 1.16.201 */
		target_runtime_entity_id?: number | undefined;
		position?: vec3f | undefined;
		/** TargetEntityRuntimeID is the runtime ID of the entity that the player interacted with. This is empty for the InteractActionOpenInventory action type. Versions: 1.16.210 – 1.26.60 */
		target_entity_id?: bigint | number | undefined;
		/** Position associated with the ActionType above. Versions: 1.21.130 – 1.26.60 */
		has_position?: boolean | undefined;
	};
	export type packet_block_pick_request = {
		x: number;
		y: number;
		z: number;
		add_user_data: boolean;
		selected_slot: number;
	};
	export type packet_entity_pick_request = {
		runtime_entity_id: Int64Write;
		selected_slot: number;
		/** WithData is true if the pick request requests the entity metadata. Versions: 1.17.30 – 1.26.60 */
		with_data?: boolean | undefined;
	};
	/**
	 * PlayerAction is sent by the client when it executes any action, for example starting to sprint, swim,
	 * starting the breaking of a block, dropping an item, etc.
	 */
	export type packet_player_action = {
		/** EntityRuntimeID is the runtime ID of the player. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_entity_id: number | bigint | number;
		/** ActionType is the ID of the action that was executed by the player. It is one of the constants that may be found above. */
		action: "start_break" | "abort_break" | "stop_break" | "get_updated_block" | "drop_item" | "start_sleeping" | "stop_sleeping" | "respawn" | "jump" | "start_sprint" | "stop_sprint" | "start_sneak" | "stop_sneak" | "creative_player_destroy_block" | "dimension_change_ack" | "start_glide" | "stop_glide" | "build_denied" | "continue_break" | "change_skin" | "set_enchatnment_seed" | "swimming" | "stop_swimming" | "start_spin_attack" | "stop_spin_attack" | "ineract_block" | number | Action;
		/** BlockPosition is the position of the target block, if the action with the ActionType set concerned a block. If that is not the case, the block position will be zero. */
		position: BlockCoordinates;
		/** BlockFace is the face of the target block that was touched. If the action with the ActionType set concerned a block. If not, the face is always 0. */
		face: number;
		/** ResultPosition is the position of the action's result. When a UseItemOn action is sent, this is the position of the block clicked, but when a block is placed, this is the position at which the block will be placed. Versions: 1.19.1 – 1.26.60 */
		result_position?: BlockCoordinates | undefined;
	};
	export type packet_hurt_armor = {
		/** Versions: 1.16.201 – 1.17.10 */
		health?: number | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		cause?: number | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		damage?: number | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		armor_slots?: bigint | number | undefined;
	};
	export type packet_set_entity_data = {
		runtime_entity_id: number | bigint | number;
		metadata: MetadataDictionary;
		tick: bigint | number;
		/** EntityProperties holds lists of entity properties that define specific attributes of an entity. As of v1.19.40, the vanilla server does not use these properties, however they are still supported by the protocol. Versions: 1.19.40 – 1.26.60 */
		properties?: EntityProperties | undefined;
	};
	/**
	 * SetActorMotion is sent by the server to change the client-side velocity of an entity. It is usually used
	 * in combination with server-side movement calculation.
	 */
	export type packet_set_entity_motion = {
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. */
		runtime_entity_id: number | bigint | number;
		/** Velocity is the new velocity the entity gets. This velocity will initiate the client-side movement of the entity. */
		velocity: vec3f;
		/** Versions: 1.20.71 – 1.26.60 */
		tick?: bigint | number | undefined;
	};
	/**
	 * SetActorLink is sent by the server to initiate an entity link client-side, meaning one entity will start
	 * riding another.
	 */
	export type packet_set_entity_link = {
		link: Link;
	};
	export type packet_set_health = {
		health: number;
	};
	export type packet_set_spawn_position = {
		spawn_type: "player" | "world" | number;
		player_position: BlockCoordinates;
		dimension: number;
		world_position: BlockCoordinates;
	};
	export type packet_animate = {
		action_id: "none" | "swing_arm" | "unknown" | "wake_up" | "critical_hit" | "magic_critical_hit" | "row_right" | "row_left" | number;
		runtime_entity_id: bigint | number;
		/** Versions: 1.16.201 – 1.17.30, 1.18.0 – 1.21.111 */
		boat_rowing_time?: number | undefined;
		/** Data holds an action-specific value whose meaning depends on the animation type. Versions: 1.21.120 – 1.26.60 */
		data?: number | undefined;
		/** Versions: 1.21.120 – 1.21.124 */
		rowing_time?: number | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		has_swing_source?: boolean | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		swing_source?: string | undefined;
		/** Versions: 1.26.60 */
		hand?: "main_hand" | "off_hand" | number | undefined;
	};
	export type packet_respawn = {
		/** Versions: 1.16.201 – 1.16.210 */
		x?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		y?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		z?: number | undefined;
		state: number;
		runtime_entity_id: number | bigint | number;
		/** Versions: 1.16.220 – 1.26.60 */
		position?: vec3f | undefined;
	};
	/**
	 * ContainerOpen is sent by the server to open a container client-side. This container must be physically
	 * present in the world, for the packet to have any effect. Unlike Java Edition, Bedrock Edition requires that
	 * chests for example must be present and in range to open its inventory.
	 */
	export type packet_container_open = {
		/** WindowID is the ID representing the window that is being opened. It may be used later to close the container using a ContainerClose packet. */
		window_id: WindowID;
		/** ContainerType is the type ID of the container that is being opened when opening the container at the position of the packet. It depends on the block/entity, and could, for example, be the window type of a chest or a hopper, but also a horse inventory. */
		window_type: WindowType;
		/** ContainerPosition is the position of the container opened. The position must point to a block entity that actually has a container. If that is not the case, the window will not be opened and the packet will be ignored, if a valid ContainerEntityUniqueID has not also been provided. */
		coordinates: BlockCoordinates;
		/** ContainerEntityUniqueID is the unique ID of the entity container that was opened. It is only used if the ContainerType is one that points to an entity, for example a horse. */
		runtime_entity_id: bigint | number;
	};
	/**
	 * ContainerClose is sent by the server to close a container the player currently has opened, which was opened
	 * using the ContainerOpen packet, or by the client to tell the server it closed a particular container, such
	 * as the crafting grid.
	 */
	export type packet_container_close = {
		/** WindowID is the ID representing the window of the container that should be closed. It must be equal to the one sent in the ContainerOpen packet to close the designated window. */
		window_id: WindowID;
		/** ServerSide determines whether or not the container was force-closed by the server. If this value is not set correctly, the client may ignore the packet and respond with a PacketViolationWarning. */
		server: boolean;
		/** ContainerType is the type ID of the container that is being opened when opening the container at the position of the packet. It depends on the block/entity, and could, for example, be the window type of a chest or a hopper, but also a horse inventory. Versions: 1.21.0 – 1.26.60 */
		window_type?: WindowType | undefined;
	};
	/**
	 * PlayerHotBar is sent by the server to the client. It used to be used to link hot bar slots of the player to
	 * actual slots in the inventory, but as of 1.2, this was changed and hot bar slots are no longer a free
	 * floating part of the inventory.
	 * Since 1.2, the packet has been re-purposed, but its new functionality is not clear.
	 */
	export type packet_player_hotbar = {
		selected_slot: number;
		window_id: WindowID;
		select_slot: boolean;
	};
	/**
	 * InventoryContent is sent by the server to update the full content of a particular inventory. It is usually
	 * sent for the main inventory of the player, but also works for other inventories that are currently opened
	 * by the player.
	 */
	export type packet_inventory_content = {
		/** Versions: 1.16.201 */
		inventory_id?: WindowIDVarint | undefined;
		/** Content is the new content of the inventory. The length of this slice must be equal to the full size of the inventory window updated. */
		input: ItemStacks | ItemV4s;
		/** WindowID is the ID that identifies one of the windows that the client currently has opened, or one of the consistent windows such as the main inventory. Versions: 1.16.210 – 1.26.60 */
		window_id?: WindowIDVarint | undefined;
		/** Versions: 1.21.20 */
		dynamic_window_id?: number | undefined;
		/** Container is the protocol.FullContainerName that describes the container that the content is for. Versions: 1.21.30 – 1.26.60 */
		container?: FullContainerName | undefined;
		/** Versions: 1.21.30 */
		dynamic_container_size?: number | undefined;
		/** storage_item is the item that is acting as the storage container for the inventory. If the inventory is not a dynamic container then this field should be left empty. When set, only the item type is used by the client and none of the other stack info. Versions: 1.21.42 – 1.26.60 */
		storage_item?: Item | ItemV4 | undefined;
	};
	/**
	 * InventorySlot is sent by the server to update a single slot in one of the inventory windows that the client
	 * currently has opened. Usually this is the main inventory, but it may also be the off hand or, for example,
	 * a chest inventory.
	 */
	export type packet_inventory_slot = {
		/** WindowID is the ID of the window that the packet modifies. It must point to one of the windows that the client currently has opened. */
		window_id: WindowIDVarint;
		/** Slot is the index of the slot that the packet modifies. The new item will be set to the slot at this index. */
		slot: number;
		/** NewItem is the item to be put in the slot at Slot. It will overwrite any item that may currently be present in that slot. */
		item: ItemStack | Item | ItemV4;
		/** Versions: 1.21.20 */
		dynamic_window_id?: number | undefined;
		/** Versions: 1.21.30 – 1.26.60 */
		container?: FullContainerName | undefined;
		/** Versions: 1.21.30 */
		dynamic_container_size?: number | undefined;
		/** Versions: 1.21.42 – 1.26.60 */
		storage_item?: Item | ItemV4 | undefined;
	};
	/**
	 * ContainerSetData is sent by the server to update specific data of a single container, meaning a block such
	 * as a furnace or a brewing stand. This data is usually used by the client to display certain features
	 * client-side.
	 */
	export type packet_container_set_data = {
		/** WindowID is the ID of the window that should have its data set. The player must have a window open with the window ID passed, or nothing will happen. */
		window_id: WindowID;
		/** Key is the key of the property. It is one of the constants that can be found above. Multiple properties share the same key, but the functionality depends on the type of the container that the data is set to. IF FURNACE: 0: furnace_tick_count 1: furnace_lit_time 2: furnace_lit_duration 3: furnace_stored_xp 4: furnace_fuel_aux IF BREWING STAND: 0: brew_time 1: brew_fuel_amount 2: brew_fuel_total */
		property: number;
		/** Value is the value of the property. Its use differs per property. */
		value: number;
	};
	export type packet_crafting_data = {
		/** Versions: 1.16.201 – 1.26.30 */
		recipes?: Recipes | undefined;
		/** PotionContainerChangeRecipes is a list of all recipes to convert a potion from one type to another, such as from a drinkable potion to a splash potion, or from a splash potion to a lingering potion. */
		potion_type_recipes: PotionTypeRecipes;
		potion_container_recipes: PotionContainerChangeRecipes;
		/** Versions: 1.16.201 – 1.17.10 */
		is_clean?: boolean | undefined;
		/** MaterialReducers is a list of all material reducers which is used in education edition chemistry. Versions: 1.17.30 – 1.26.60 */
		material_reducers?: MaterialReducer[] | undefined;
		/** ClearRecipes indicates if all recipes currently active on the client should be cleaned. Doing this means that the client will have no recipes active by itself: Any CraftingData packets previously sent will also be discarded, and only the recipes in this CraftingData packet will be used. Versions: 1.17.30 – 1.26.60 */
		clear_recipes?: boolean | undefined;
		/** As of 1.26.40 recipes are no longer sent as one tagged array; each recipe kind has its own array and the recipe type is implied by which array the recipe appears in. Versions: 1.26.40 – 1.26.60 */
		shaped_recipes?: ShapedRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		shapeless_recipes?: ShapelessRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		multi_recipes?: MultiRecipe[] | undefined;
		/** Shulker box recipes, which are shapeless. Versions: 1.26.40 – 1.26.60 */
		shulker_box_recipes?: ShapelessRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		shapeless_chemistry_recipes?: ShapelessRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		shaped_chemistry_recipes?: ShapedRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		smithing_transform_recipes?: SmithingTransformRecipe[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		smithing_trim_recipes?: SmithingTrimRecipe[] | undefined;
	};
	/**
	 * CraftingEvent is sent by the client when it crafts a particular item. Note that this packet may be fully
	 * ignored, as the InventoryTransaction packet provides all the information required.
	 */
	export type packet_crafting_event = {
		/** WindowID is the ID representing the window that the player crafted in. */
		window_id: WindowID;
		/** CraftingType is a type that indicates the way the crafting was done, for example if a crafting table was used. */
		recipe_type: "inventory" | "crafting" | "workbench" | number;
		/** RecipeUUID is the UUID of the recipe that was crafted. It points to the UUID of the recipe that was sent earlier in the CraftingData packet. */
		recipe_id: string;
		/** Input is a list of items that the player put into the recipe so that it could create the Output items. These items are consumed in the process. */
		input: Item[] | ItemV4[];
		/** Output is a list of items that were obtained as a result of crafting the recipe. */
		result: Item[] | ItemV4[];
	};
	/**
	 * GUIDataPickItem is sent by the server to make the client 'select' a hot bar slot. It currently appears to
	 * be broken however, and does not actually set the selected slot to the hot bar slot set in the packet.
	 */
	export type packet_gui_data_pick_item = {
		/** ItemName is the name of the item that shows up in the top part of the popup that shows up when selecting an item. It is shown as if an item was selected by the player itself. Versions: 1.16.210 – 1.26.60 */
		item_name?: string | undefined;
		/** ItemEffects is the line under the ItemName, where the effects of the item are usually situated. Versions: 1.16.210 – 1.26.60 */
		item_effects?: string | undefined;
		/** HotBarSlot is the hot bar slot to be selected/picked. This does not currently work, so it does not matter what number this is. Versions: 1.16.210 – 1.26.60 */
		hotbar_slot?: number | undefined;
	};
	/**
	 * AdventureSettings is sent by the server to update game-play related features, in particular permissions to
	 * access these features for the client. It includes allowing the player to fly, build and mine, and attack
	 * entities. Most of these flags should be checked server-side instead of using this packet only.
	 * The client may also send this packet to the server when it updates one of these settings through the
	 * in-game settings interface. The server should verify if the player actually has permission to update those
	 * settings.
	 */
	export type packet_adventure_settings = {
		/** Flags is a set of flags that specify certain properties of the player, such as whether or not it can fly and/or move through blocks. It is one of the AdventureFlag constants above. */
		flags: AdventureFlags;
		/** CommandPermissionLevel is a permission level that specifies the kind of commands that the player is allowed to use. */
		command_permission: "normal" | "operator" | "host" | "automation" | "admin" | number | CommandPermissionLevelVarint;
		/** ActionPermissions is, much like Flags, a set of flags that specify actions that the player is allowed to undertake, such as whether it is allowed to edit blocks, open doors etc. It is a combination of the ActionPermission constants above. */
		action_permissions: ActionPermissions;
		/** PermissionLevel is the permission level of the player as it shows up in the player list built up using the PlayerList packet. It is one of the PermissionLevel constants above. */
		permission_level: "visitor" | "member" | "operator" | "custom" | number | PermissionLevel;
		/** Custom permissions */
		custom_stored_permissions: number;
		/** PlayerUniqueID is a unique identifier of the player. It appears it is not required to fill this field out with a correct value. Simply writing 0 seems to work. */
		user_id: Int64Write;
	};
	export type AdventureFlags = {
		_value?: number | undefined;
		world_immutable?: boolean | undefined;
		no_pvp?: boolean | undefined;
		auto_jump?: boolean | undefined;
		allow_flight?: boolean | undefined;
		no_clip?: boolean | undefined;
		world_builder?: boolean | undefined;
		flying?: boolean | undefined;
		muted?: boolean | undefined;
	};
	export type ActionPermissions = {
		_value?: number | undefined;
		/** Versions: 1.16.201 */
		build_and_mine?: boolean | undefined;
		doors_and_switches?: boolean | undefined;
		open_containers?: boolean | undefined;
		attack_players?: boolean | undefined;
		attack_mobs?: boolean | undefined;
		operator?: boolean | undefined;
		teleport?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		mine?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		build?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		default?: boolean | undefined;
	};
	export type packet_block_entity_data = {
		position: BlockCoordinates;
		nbt: NBT;
	};
	/**
	 * Removed in 1.21.80
	 */
	export type packet_player_input = {
		motion_x: number;
		motion_z: number;
		jumping: boolean;
		sneaking: boolean;
	};
	/**
	 * LevelChunk is sent by the server to provide the client with a chunk of a world data (16xYx16 blocks).
	 * Typically a certain amount of chunks is sent to the client before sending it the spawn PlayStatus packet,
	 * so that the client spawns in a loaded world.
	 */
	export type packet_level_chunk = {
		/** ChunkX is the X coordinate of the chunk sent. (To translate a block's X to a chunk's X: x >> 4) */
		x: number;
		/** ChunkZ is the Z coordinate of the chunk sent. (To translate a block's Z to a chunk's Z: z >> 4) */
		z: number;
		/** SubChunkCount is the amount of sub chunks that are part of the chunk sent. Depending on if the cache is enabled, a list of blob hashes will be sent, or, if disabled, the sub chunk data. On newer versions, if this is a negative value it indicates to use the Subchunk Polling mechanism */
		sub_chunk_count: number;
		/** CacheEnabled specifies if the client blob cache should be enabled. This system is based on hashes of blobs which are consistent and saved by the client in combination with that blob, so that the server does not have to send the same chunk multiple times. If the client does not yet have a blob with the hash sent, it will send a ClientCacheBlobStatus packet containing the hashes is does not have the data of. */
		cache_enabled: boolean;
		/** BlobHashes is a list of all blob hashes used in the chunk. It is composed of SubChunkCount + 1 hashes, with the first SubChunkCount hashes being those of the sub chunks and the last one that of the biome of the chunk. If CacheEnabled is set to false, BlobHashes is left empty. As of 1.26.40 the array is always written. */
		blobs?: {
			hashes: Int64Write[];
		} | Int64Write[] | undefined;
		/** RawPayload is a serialised string of chunk data. The data held depends on if CacheEnabled is set to true. If set to false, the payload is composed of multiple sub-chunks, each of which carry a version which indicates the way they are serialised, followed by biomes, border blocks and tile entities. If CacheEnabled is true, the payload consists out of the border blocks and tile entities only. */
		payload: ByteArray;
		/** Versions: 1.18.11 – 1.26.60 */
		highest_subchunk_count?: number | undefined;
		/** Versions: 1.20.61 – 1.26.60 */
		dimension?: number | undefined;
		/** Versions: 1.26.60 */
		client_biome_update?: boolean | undefined;
	};
	export type packet_set_commands_enabled = {
		enabled: boolean;
	};
	export type packet_set_difficulty = {
		difficulty: number;
	};
	export type packet_change_dimension = {
		dimension: number;
		position: vec3f;
		respawn: boolean;
		/** Versions: 1.21.20 – 1.26.60 */
		loading_screen_id?: number | undefined;
	};
	/**
	 * SetPlayerGameType is sent by the server to update the game type (game mode) of the player
	 */
	export type packet_set_player_game_type = {
		/** The new gamemode for the player. Some of these game types require additional flags to be set in an AdventureSettings packet for the game mode to obtain its full functionality. # Note: this is actually encoded 64-bit varint, but realistically won't exceed a few bits */
		gamemode: GameMode;
	};
	export type packet_player_list = {
		records: PlayerRecords;
	};
	export type packet_simple_event = {
		event_type: "uninitialized_subtype" | "enable_commands" | "disable_commands" | "unlock_world_template_settings" | number;
	};
	/**
	 * Event is sent by the server to send an event with additional data. It is typically sent to the client for
	 * telemetry reasons, much like the SimpleEvent packet.
	 */
	export type packet_event = {
		runtime_id: bigint | number;
		event_type: "achievement_awarded" | "entity_interact" | "portal_built" | "portal_used" | "mob_killed" | "cauldron_used" | "player_death" | "boss_killed" | "agent_command" | "agent_created" | "banner_pattern_removed" | "command_executed" | "fish_bucketed" | "mob_born" | "pet_died" | "cauldron_block_used" | "composter_block_used" | "bell_block_used" | number | "actor_definition" | "raid_update" | "player_movement_anomaly" | "player_movement_corrected" | "honey_harvested" | "target_block_hit" | "piglin_barter" | "waxed_or_unwaxed_copper" | "code_builder_runtime_action" | "code_builder_scoreboard" | "strider_ridden_in_lava_in_overworld" | "sneak_close_to_sculk_sensor" | "careful_restoration" | "item_used";
		use_player_id: number;
		event_data: Buffer;
	};
	export type packet_spawn_experience_orb = {
		position: vec3f;
		count: number;
	};
	/**
	 * ClientBoundMapItemData is sent by the server to the client to update the data of a map shown to the client.
	 * It is sent with a combination of flags that specify what data is updated.
	 * The ClientBoundMapItemData packet may be used to update specific parts of the map only. It is not required
	 * to send the entire map each time when updating one part.
	 */
	export type packet_clientbound_map_item_data = {
		/** Versions: 1.16.201 – 1.16.210 */
		mapinfo?: never | undefined;
		/** MapID is the unique identifier that represents the map that is updated over network. It remains consistent across sessions. Versions: 1.16.220 – 1.26.60 */
		map_id?: bigint | number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		update_flags?: UpdateMapFlags | undefined;
		/** Dimension is the dimension of the map that should be updated, for example the overworld (0), the nether (1) or the end (2). Versions: 1.16.220 – 1.26.60 */
		dimension?: number | undefined;
		/** LockedMap specifies if the map that was updated was a locked map, which may be done using a cartography table. Versions: 1.16.220 – 1.26.60 */
		locked?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		included_in?: bigint | number[] | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		scale?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		tracked?: {
			objects: TrackedObject[];
			decorations: MapDecoration[];
		} | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		texture?: {
			width: number;
			height: number;
			x_offset: number;
			y_offset: number;
			pixels: number[];
		} | undefined;
		/** Origin is the center position of the map being updated. Versions: 1.19.20 – 1.26.60 */
		origin?: vec3i | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		tracked_objects?: TrackedObject[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		decorations?: MapDecoration[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		width?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		height?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		x_offset?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		y_offset?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		pixels?: number[] | undefined;
	};
	export type packet_map_info_request = {
		map_id: bigint | number;
		/** ClientPixels is a map of pixels sent from the client to notify the server about the pixels that it isn't aware of. Versions: 1.19.20 – 1.26.60 */
		client_pixels?: {
			rgba: number;
			index: number;
		}[] | undefined;
	};
	/**
	 * RequestChunkRadius is sent by the client to the server to update the server on the chunk view radius that
	 * it has set in the settings. The server may respond with a ChunkRadiusUpdated packet with either the chunk
	 * radius requested, or a different chunk radius if the server chooses so.
	 */
	export type packet_request_chunk_radius = {
		/** ChunkRadius is the requested chunk radius. This value is always the value set in the settings of the player. */
		chunk_radius: number;
		/** Versions: 1.19.80 – 1.26.60 */
		max_radius?: number | undefined;
	};
	/**
	 * ChunkRadiusUpdated is sent by the server in response to a RequestChunkRadius packet. It defines the chunk
	 * radius that the server allows the client to have. This may be lower than the chunk radius requested by the
	 * client in the RequestChunkRadius packet.
	 */
	export type packet_chunk_radius_update = {
		/** ChunkRadius is the final chunk radius that the client will adapt when it receives the packet. It does not have to be the same as the requested chunk radius. */
		chunk_radius: number;
	};
	/**
	 * Versions: 1.16.201 – 1.20.61
	 */
	export type packet_item_frame_drop_item = {
		/** Versions: 1.16.201 – 1.20.61 */
		coordinates: BlockCoordinates;
	};
	export type packet_game_rules_changed = {
		rules: GameRules | GameRuleI32[];
	};
	/**
	 * Camera is sent by the server to use an Education Edition camera on a player. It produces an image
	 * client-side.
	 */
	export type packet_camera = {
		/** CameraEntityUniqueID is the unique ID of the camera entity from which the picture was taken. */
		camera_entity_unique_id: bigint | number;
		/** TargetPlayerUniqueID is the unique ID of the target player. The unique ID is a value that remains consistent across different sessions of the same world, but most servers simply fill the runtime ID of the player out for this field. */
		target_player_unique_id: bigint | number;
	};
	export type packet_boss_event = {
		/** Versions: 1.16.201 – 1.26.20 */
		boss_entity_id?: bigint | number | undefined;
		type: "show_bar" | "register_player" | "hide_bar" | "unregister_player" | "set_bar_progress" | "set_bar_title" | "update_properties" | "texture" | number | "query";
		/** Versions: 1.16.201 – 1.26.45 */
		player_id?: bigint | number | undefined;
		/** BossBarTitle is the title shown above the boss bar. It currently does not function, and instead uses the name tag of the boss entity at all times. It is only set if the EventType is BossEventShow or BossEventTitle. */
		title?: string | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		bar_progress?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		darkness_factor?: number | undefined;
		/** Colour is the colour of the boss bar that is shown when a player is subscribed. It currently does not function. It is only set if the EventType is BossEventShow, BossEventAppearanceProperties or BossEventTexture. Format is ARGB */
		color?: number | "pink" | "blue" | "red" | "green" | "yellow" | "purple" | "rebecca_purple" | "white" | undefined;
		/** Overlay is the overlay of the boss bar that is shown on top of the boss bar when a player is subscribed. It currently does not function. It is only set if the EventType is BossEventShow, BossEventAppearanceProperties or BossEventTexture. */
		overlay?: number | "progress" | "notched_6" | "notched_10" | "notched_12" | "notched_20" | undefined;
		/** HealthPercentage is the percentage of health that is shown in the boss bar. It currently does not function, and instead uses the health percentage of the boss entity at all times. It is only set if the EventType is BossEventShow or BossEventHealthPercentage. Versions: 1.16.220 – 1.26.60 */
		progress?: number | undefined;
		/** Versions: 1.16.220 – 1.26.20 */
		screen_darkening?: number | undefined;
		/** FilteredBossBarTitle is a filtered version of BossBarTitle with all the profanity removed. The client will use this over BossBarTitle if this field is not empty and they have the "Filter Profanity" setting enabled. Versions: 1.21.60 – 1.26.60 */
		filtered_title?: string | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		target_entity_id?: bigint | number | undefined;
	};
	export type packet_show_credits = {
		runtime_entity_id: number | bigint | number;
		status: number;
	};
	/**
	 * This packet sends a list of commands to the client. Commands can have
	 * arguments, and some of those arguments can have 'enum' values, which are a list of possible
	 * values for the argument. The serialization is rather complex and involves palettes like chunks.
	 * # In bedrock-protocol, listen to on('client.commands') for a simpler representation
	 */
	export type packet_available_commands = {
		/** The length of the enums for all the command parameters in this packet */
		values_len: number;
		/** Versions: 1.16.201 – 1.21.124 */
		_enum_type?: "byte" | "short" | "int" | undefined;
		/** Here all the enum values for all of the possible commands are stored to one array palette */
		enum_values: string[];
		/** Integer parameters may sometimes have a prefix, such as the XP command: /xp <amount: int> [player: target] <- here, the xp command gives experience points /xp <amount: int>L [player: target] <- here, the xp command gives experience levels This is the palette of suffixes */
		suffixes: string[];
		/** The list of enum objects */
		enums: {
			/** The name of the enum */
			name: string;
			/** The values in the enum. In 1.21.130 this is always lu32. */
			values: Array<number | undefined> | number[];
		}[];
		command_data: {
			name: string;
			description: string;
			flags: number;
			permission_level: number | string;
			alias: number;
			overloads: {
				parameters: {
					parameter_name: string;
					value_type: "int" | "float" | "value" | "wildcard_int" | "operator" | "target" | "file_path" | "string" | "position" | "message" | "raw_text" | "json" | "command" | number | "wildcard" | "block_position" | "command_operator" | "wildcard_target" | "integer_range" | "equipment_slots" | "block_states";
					enum_type: "valid" | "enum" | "suffixed" | "soft_enum" | number;
					optional: boolean;
					options: CommandFlags;
				}[];
				chaining?: boolean | undefined;
			}[];
			chained_subcommand_offsets?: number[] | undefined;
		}[];
		dynamic_enums: {
			name: string;
			values: string[];
		}[];
		enum_constraints: {
			value_index: number;
			enum_index: number;
			constraints: {
				constraint: "cheats_enabled" | number | "operator_permissions" | "host_permissions";
			}[];
		}[];
		/** chained_subcommand_values is a slice of all chained subcommand names. chained_subcommand_values generally should contain each possible value only once. chained_subcommands are built by pointing to entries in this slice. Versions: 1.20.10 – 1.26.60 */
		chained_subcommand_values?: string[] | undefined;
		/** chained_subcommands is a slice of all subcommands that are followed by a chained command. An example usage of this is /execute which allows you to run another command as another entity or at a different position etc. Versions: 1.20.10 – 1.26.60 */
		chained_subcommands?: {
			/** ChainedSubcommandValue represents the value for a chained subcommand argument. name is the name of the chained subcommand and shows up in the list as a regular subcommand enum. */
			name: string;
			/** values contains the index and parameter type of the chained subcommand. */
			values: {
				/** index is the index of the argument in the ChainedSubcommandValues slice. In 1.21.130 this changed from lu16 to varint. */
				index: number;
				/** value is a combination of the flags above. In 1.21.130 this changed from lu16 to varint. */
				value: number;
			}[];
		}[] | undefined;
	};
	/**
	 * ParamOptionCollapseEnum specifies if the enum (only if the Type is actually an enum type. If not,
	 * setting this to true has no effect) should be collapsed. This means that the options of the enum are
	 * never shown in the actual usage of the command, but only as auto-completion, like it automatically does
	 * with enums that have a big amount of options. To illustrate, it can make
	 * <false|true|yes|no> <$Name: bool>.
	 */
	export type CommandFlags = {
		unused: number;
		has_semantic_constraint: number;
		collapse_enum: number;
		/** Versions: 1.17.30 – 1.26.60 */
		as_chained_command?: number | undefined;
		/** Versions: 1.18.0 – 1.26.60 */
		unknown2?: number | undefined;
	};
	/**
	 * enum_size_based_on_values_len: native
	 * CommandRequest is sent by the client to request the execution of a server-side command. Although some
	 * servers support sending commands using the Text packet, this packet is guaranteed to have the correct
	 * result.
	 */
	export type packet_command_request = {
		/** CommandLine is the raw entered command line. The client does no parsing of the command line by itself (unlike it did in the early stages), but lets the server do that. */
		command: string;
		/** Origin holds information about the command sender that will be returnd back in the command response */
		origin: CommandOrigin;
		/** Internal specifies if the command request internal. Setting it to false seems to work and the usage of this field is not known. */
		internal: boolean;
		/** Specifies the version of the command to run, relative to the current Minecraft version. Should be set to 52 as of 1.19.62 Versions: 1.19.60 – 1.26.60 */
		version?: number | string | undefined;
	};
	/**
	 * CommandBlockUpdate is sent by the client to update a command block at a specific position. The command
	 * block may be either a physical block or an entity.
	 */
	export type packet_command_block_update = {
		/** Block specifies if the command block updated was an actual physical block. If false, the command block is in a minecart and has an entity runtime ID instead. */
		is_block: boolean;
		position?: BlockCoordinates | undefined;
		mode?: "impulse" | "repeat" | "chain" | number | undefined;
		needs_redstone?: boolean | undefined;
		conditional?: boolean | undefined;
		minecart_entity_runtime_id?: bigint | number | undefined;
		command: string;
		last_output: string;
		name: string;
		should_track_output: boolean;
		tick_delay: number;
		execute_on_first_tick: boolean;
		/** Versions: 1.21.60 – 1.26.60 */
		filtered_name?: string | undefined;
	};
	export type packet_command_output = {
		/** CommandOrigin is the data specifying the origin of the command. In other words, the source that the command request was from, such as the player itself or a websocket server. The client forwards the messages in this packet to the right origin, depending on what is sent here. */
		origin: CommandOrigin;
		/** OutputType specifies the type of output that is sent. OutputType specifies the type of output that is sent. */
		output_type: number | "last" | "silent" | "all" | "data_set" | string;
		/** SuccessCount is the amount of times that a command was executed successfully as a result of the command that was requested. For servers, this is usually a rather meaningless fields, but for vanilla, this is applicable for commands created with Functions. */
		success_count: number;
		/** OutputMessages is a list of all output messages that should be sent to the player. Whether they are shown or not, depends on the type of the messages. */
		output: {
			/** Success indicates if the output message was one of a successful command execution. */
			success: boolean;
			/** Message is the message that is sent to the client in the chat window. */
			message_id: string;
			/** Parameters is a list of parameters that serve to supply the message sent with additional information, such as the position that a player was teleported to or the effect that was applied to an entity. These parameters only apply for the Minecraft built-in command output. */
			parameters: string[];
		}[];
		/** Versions: 1.16.210 – 1.21.124 */
		data_set?: string | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		has_data?: boolean | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		data?: string | undefined;
	};
	/**
	 * UpdateTrade is sent by the server to update the trades offered by a villager to a player. It is sent at the
	 * moment that a player interacts with a villager.
	 */
	export type packet_update_trade = {
		/** WindowID is the ID that identifies the trading window that the client currently has opened. */
		window_id: WindowID;
		/** WindowType is an identifier specifying the type of the window opened. In vanilla, it appears this is always filled out with 15. */
		window_type: WindowType;
		/** Size is the amount of trading options that the villager has. */
		size: number;
		/** TradeTier is the tier of the villager that the player is trading with. The tier starts at 0 with a first two offers being available, after which two additional offers are unlocked each time the tier becomes one higher. */
		trade_tier: number;
		/** VillagerUniqueID is the unique ID of the villager entity that the player is trading with. The TradeTier sent above applies to this villager. */
		villager_unique_id: bigint | number;
		/** EntityUniqueID is the unique ID of the entity (usually a player) for which the trades are updated. The updated trades may apply only to this entity. */
		entity_unique_id: bigint | number;
		/** DisplayName is the name displayed at the top of the trading UI. It is usually used to represent the profession of the villager in the UI. */
		display_name: string;
		/** NewTradeUI specifies if the villager should be using the new trade UI (The one added in 1.11.) rather than the old one. This should usually be set to true. */
		new_trading_ui: boolean;
		/** Trading based on Minecraft economy - specifies if the prices of the villager's offers are modified by an increase in demand for the item. (A mechanic added in 1.11.) Buying more of the same item will increase the price of that particular item. https://minecraft.wiki/w/Trading#Economics */
		economic_trades: boolean;
		/** NBT serialised compound of offers that the villager has. */
		offers: NBT;
	};
	/**
	 * UpdateEquip is sent by the server to the client upon opening a horse inventory. It is used to set the
	 * content of the inventory and specify additional properties, such as the items that are allowed to be put
	 * in slots of the inventory.
	 */
	export type packet_update_equipment = {
		/** WindowID is the identifier associated with the window that the UpdateEquip packet concerns. It is the ID sent for the horse inventory that was opened before this packet was sent. */
		window_id: WindowID;
		/** WindowType is the type of the window that was opened. Generally, this is the type of a horse inventory, as the packet is specifically made for that. */
		window_type: WindowType;
		/** Size is the size of the horse inventory that should be opened. A bigger size does, in fact, change the amount of slots displayed. */
		size: number;
		/** EntityUniqueID is the unique ID of the entity whose equipment was 'updated' to the player. It is typically the horse entity that had its inventory opened. */
		entity_id: bigint | number;
		/** `inventory` is a network NBT serialised compound holding the content of the inventory of the entity (the equipment) and additional data such as the allowed items for a particular slot, used to make sure only saddles can be put in the saddle slot etc. */
		inventory: NBT;
	};
	/**
	 * ResourcePackDataInfo is sent by the server to the client to inform the client about the data contained in
	 * one of the resource packs that are about to be sent.
	 */
	export type packet_resource_pack_data_info = {
		/** Versions: 1.16.201 – 1.16.210 */
		package_id?: string | undefined;
		/** DataChunkSize is the maximum size in bytes of the chunks in which the total size of the resource pack to be sent will be divided. A size of 1MB (1024*1024) means that a resource pack of 15.5MB will be split into 16 data chunks. */
		max_chunk_size: number;
		/** ChunkCount is the total amount of data chunks that the sent resource pack will exist out of. It is the total size of the resource pack divided by the DataChunkSize field. The client doesn't actually seem to use this field. Rather, it divides the size by the chunk size to calculate it itself. */
		chunk_count: number;
		/** Versions: 1.16.201 – 1.16.210 */
		compressed_package_size?: Int64Write | undefined;
		/** Hash is a SHA256 hash of the content of the resource pack. */
		hash: ByteArray;
		/** Premium specifies if the resource pack was a premium resource pack, meaning it was bought from the Minecraft store. */
		is_premium: boolean;
		/** PackType is the type of the resource pack. It is one of the resource pack types listed. */
		pack_type: number | "addon" | "cached" | "copy_protected" | "behavior" | "persona_piece" | "resources" | "skins" | "world_template";
		/** UUID is the unique ID of the resource pack that the info concerns. Versions: 1.16.220 – 1.26.60 */
		pack_id?: string | undefined;
		/** Size is the total size in bytes that the resource pack occupies. This is the size of the compressed archive (zip) of the resource pack. Versions: 1.16.220 – 1.26.60 */
		size?: Int64Write | undefined;
	};
	/**
	 * ResourcePackChunkData is sent to the client so that the client can download the resource pack. Each packet
	 * holds a chunk of the compressed resource pack, of which the size is defined in the ResourcePackDataInfo
	 * packet sent before.
	 */
	export type packet_resource_pack_chunk_data = {
		/** Versions: 1.16.201 – 1.16.210 */
		package_id?: string | undefined;
		/** ChunkIndex is the current chunk index of the chunk. It is a number that starts at 0 and is incremented for each resource pack data chunk sent to the client. */
		chunk_index: number;
		/** DataOffset is the current progress in bytes or offset in the data that the resource pack data chunk is taken from. */
		progress: Int64Write;
		/** RawPayload is a byte slice containing a chunk of data from the resource pack. It must be of the same size or less than the DataChunkSize set in the ResourcePackDataInfo packet. */
		payload: ByteArray;
		/** UUID is the unique ID of the resource pack that the chunk of data is taken out of. Versions: 1.16.220 – 1.26.60 */
		pack_id?: string | undefined;
	};
	/**
	 * ResourcePackChunkRequest is sent by the client to request a chunk of data from a particular resource pack,
	 * that it has obtained information about in a ResourcePackDataInfo packet.
	 */
	export type packet_resource_pack_chunk_request = {
		/** Versions: 1.16.201 – 1.16.210 */
		package_id?: string | undefined;
		/** ChunkIndex is the requested chunk index of the chunk. It is a number that starts at 0 and is incremented for each resource pack data chunk requested. */
		chunk_index: number;
		/** UUID is the unique ID of the resource pack that the chunk of data is requested from. Versions: 1.16.220 – 1.26.60 */
		pack_id?: string | undefined;
	};
	export type packet_transfer = {
		server_address: string;
		port: number;
		/** Versions: 1.21.30 – 1.26.60 */
		reload_world?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		gatherings_configuration?: GatheringJoinInfo | undefined;
	};
	export type packet_play_sound = {
		name: string;
		coordinates: BlockCoordinates;
		volume: number;
		pitch: number;
		/** Versions: 1.26.20 – 1.26.60 */
		handle?: Int64Write | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		loop_count?: number | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		bypass_listener_range_check?: boolean | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		playback_position_seconds?: number | undefined;
	};
	export type packet_stop_sound = {
		name: string;
		stop_all: boolean;
		/** Versions: 1.21.20 – 1.26.60 */
		stop_music_legacy?: boolean | undefined;
	};
	/**
	 * SetTitle is sent by the server to make a title, subtitle or action bar shown to a player. It has several
	 * fields that allow setting the duration of the titles.
	 */
	export type packet_set_title = {
		/** ActionType is the type of the action that should be executed upon the title of a player. It is one of the constants above and specifies the response of the client to the packet. */
		type: number | "clear" | "reset" | "set_title" | "set_subtitle" | "action_bar_message" | "set_durations" | "set_title_json" | "set_subtitle_json" | "action_bar_message_json";
		/** Text is the text of the title, which has a different meaning depending on the ActionType that the packet has. The text is the text of a title, subtitle or action bar, depending on the type set. */
		text: string;
		/** FadeInDuration is the duration that the title takes to fade in on the screen of the player. It is measured in 20ths of a second (AKA in ticks). */
		fade_in_time: number;
		/** RemainDuration is the duration that the title remains on the screen of the player. It is measured in 20ths of a second (AKA in ticks). */
		stay_time: number;
		/** FadeOutDuration is the duration that the title takes to fade out of the screen of the player. It is measured in 20ths of a second (AKA in ticks). */
		fade_out_time: number;
		/** XUID is the XBOX Live user ID of the player, which will remain consistent as long as the player is logged in with the XBOX Live account. It is empty if the user is not logged into its XBL account. Versions: 1.17.10 – 1.26.60 */
		xuid?: string | undefined;
		/** PlatformOnlineID is either a uint64 or an empty string. Versions: 1.17.10 – 1.26.60 */
		platform_online_id?: string | undefined;
		/** FilteredMessage is a filtered version of Message with all the profanity removed. The client will use this over Message if this field is not empty and they have the "Filter Profanity" setting enabled. Versions: 1.21.20 – 1.26.60 */
		filtered_message?: string | undefined;
	};
	export type packet_add_behavior_tree = {
		behaviortree: string;
	};
	/**
	 * StructureBlockUpdate is sent by the client when it updates a structure block using the in-game UI. The
	 * data it contains depends on the type of structure block that it is. In Minecraft Bedrock Edition v1.11,
	 * there is only the Export structure block type, but in v1.13 the ones present in Java Edition will,
	 * according to the wiki, be added too.
	 */
	export type packet_structure_block_update = {
		/** Position is the position of the structure block that is updated. Versions: 1.16.220 – 1.26.60 */
		position?: BlockCoordinates | undefined;
		/** StructureName is the name of the structure that was set in the structure block's UI. This is the name used to export the structure to a file. Versions: 1.16.220 – 1.26.60 */
		structure_name?: string | undefined;
		/** DataField is the name of a function to run, usually used during natural generation. A description can be found here: https://minecraft.wiki/w/Structure_Block#Data. Versions: 1.16.220 – 1.26.60 */
		data_field?: string | undefined;
		/** IncludePlayers specifies if the 'Include Players' toggle has been enabled, meaning players are also exported by the structure block. Versions: 1.16.220 – 1.26.60 */
		include_players?: boolean | undefined;
		/** ShowBoundingBox specifies if the structure block should have its bounds outlined. A thin line will encapsulate the bounds of the structure if set to true. Versions: 1.16.220 – 1.26.60 */
		show_bounding_box?: boolean | undefined;
		/** StructureBlockType is the type of the structure block updated. A list of structure block types that will be used can be found in the constants above. Versions: 1.16.220 – 1.26.60 */
		structure_block_type?: number | undefined;
		/** Settings is a struct of settings that should be used for exporting the structure. These settings are identical to the last sent in the StructureBlockUpdate packet by the client. Versions: 1.16.220 – 1.26.60 */
		settings?: StructureBlockSettings | undefined;
		/** RedstoneSaveMode is the mode that should be used to save the structure when used with redstone. In Java Edition, this is always stored in memory, but in Bedrock Edition it can be stored either to disk or memory. See the constants above for the options. As of 1.26.40 this is a single byte instead of a zigzag varint. Versions: 1.16.220 – 1.26.60 */
		redstone_save_mode?: number | undefined;
		/** ShouldTrigger specifies if the structure block should be triggered immediately after this packet reaches the server. Versions: 1.16.220 – 1.26.60 */
		should_trigger?: boolean | undefined;
		/** Waterlogged specifies if the structure block is waterlogged at the time of the packet being sent. Versions: 1.19.30 – 1.26.60 */
		water_logged?: boolean | undefined;
		/** FilteredStructureName is a filtered version of StructureName with all the profanity removed. The client will use this over StructureName if this field is not empty and they have the "Filter Profanity" setting enabled. Versions: 1.21.60 – 1.26.60 */
		filtered_structure_name?: string | undefined;
	};
	/**
	 * ShowStoreOffer is sent by the server to show a Marketplace store offer to a player. It opens a window
	 * client-side that displays the item.
	 * The ShowStoreOffer packet only works on the partnered servers: Servers that are not partnered will not have
	 * a store buttons show up in the in-game pause menu and will, as a result, not be able to open store offers
	 * on the client side. Sending the packet does therefore not work when using a proxy that is not connected to
	 * with the domain of one of the partnered servers.
	 */
	export type packet_show_store_offer = {
		/** Versions: 1.16.201 – 1.16.210 */
		unknown0?: string | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown1?: boolean | undefined;
		/** Versions: 1.16.220 – 1.21.111 */
		offer_id?: string | undefined;
		/** Versions: 1.16.220 – 1.20.40 */
		show_all?: boolean | undefined;
		/** ShowAll specifies if all other offers of the same 'author' as the one of the offer associated with the OfferUUID should also be displayed, alongside the target offer. Versions: 1.20.50 – 1.26.60 */
		redirect_type?: "marketplace" | "dressing_room" | "third_party_server_page" | number | undefined;
		/** OfferUUID is a UUID that identifies the offer for which a window should be opened. Versions: 1.21.120 – 1.26.60 */
		offer_uuid?: string | undefined;
	};
	/**
	 * PurchaseReceipt is sent by the client to the server to notify the server it purchased an item from the
	 * Marketplace store that was offered by the server. The packet is only used for partnered servers.
	 */
	export type packet_purchase_receipt = {
		/** Receipts is a list of receipts, or proofs of purchases, for the offers that have been purchased by the player. */
		receipts: string[];
	};
	export type packet_player_skin = {
		uuid: string;
		skin: Skin;
		skin_name: string;
		old_skin_name: string;
		/** Versions: 1.16.201 – 1.26.30 */
		is_verified?: boolean | undefined;
	};
	/**
	 * SubClientLogin is sent when a sub-client joins the server while another client is already connected to it.
	 * The packet is sent as a result of split-screen game play, and allows up to four players to play using the
	 * same network connection. After an initial Login packet from the 'main' client, each sub-client that
	 * connects sends a SubClientLogin to request their own login.
	 */
	export type packet_sub_client_login = {
		/** ConnectionRequest is a string containing information about the player and JWTs that may be used to verify if the player is connected to XBOX Live. The connection request also contains the necessary client public key to initiate encryption. The ConnectionRequest in this packet is identical to the one found in the Login packet. */
		tokens?: LoginTokens | undefined;
	};
	/**
	 * AutomationClientConnect is used to make the client connect to a websocket server. This websocket server has
	 * the ability to execute commands on the behalf of the client and it can listen for certain events fired by
	 * the client.
	 */
	export type packet_initiate_web_socket_connection = {
		/** ServerURI is the URI to make the client connect to. It can be, for example, 'localhost:8000/ws' to connect to a websocket server on the localhost at port 8000. */
		server: string;
	};
	/**
	 * SetLastHurtBy is sent by the server to let the client know what entity type it was last hurt by. At this
	 * moment, the packet is useless and should not be used. There is no behaviour that depends on if this
	 * packet is sent or not.
	 */
	export type packet_set_last_hurt_by = {
		/** Versions: 1.16.201 – 1.16.210 */
		unknown?: number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		entity_type?: number | undefined;
	};
	/**
	 * BookEdit is sent by the client when it edits a book. It is sent each time a modification was made and the
	 * player stops its typing 'session', rather than simply after closing the book.
	 */
	export type packet_book_edit = {
		type: "replace_page" | "add_page" | "delete_page" | "swap_pages" | "sign" | number;
		/** Versions: 1.16.201 – 1.21.130 */
		slot?: number | undefined;
		page_number?: number | undefined;
		text?: string | undefined;
		photo_name?: string | undefined;
		page1?: number | undefined;
		page2?: number | undefined;
		title?: string | undefined;
		author?: string | undefined;
		xuid?: string | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		inventory_slot?: number | undefined;
	};
	/**
	 * NPCRequest is sent by the client when it interacts with an NPC.
	 * The packet is specifically made for Education Edition, where NPCs are available to use.
	 */
	export type packet_npc_request = {
		/** EntityRuntimeID is the runtime ID of the NPC entity that the player interacted with. It is the same as sent by the server when spawning the entity. */
		runtime_entity_id: number | bigint | number;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown0?: number | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown1?: string | undefined;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown2?: number | undefined;
		/** RequestType is the type of the request, which depends on the permission that the player has. It will be either a type that indicates that the NPC should show its dialog, or that it should open the editing window. Versions: 1.16.220 – 1.26.60 */
		request_type?: "set_actions" | "execute_action" | "execute_closing_commands" | "set_name" | "set_skin" | "set_interaction_text" | "execute_opening_commands" | number | undefined;
		/** CommandString is the command string set in the NPC. It may consist of multiple commands, depending on what the player set in it. Versions: 1.16.220 – 1.26.60 */
		command?: string | undefined;
		/** ActionType is the type of the action to execute. Versions: 1.16.220 – 1.26.60 */
		action_type?: number | "set_actions" | "execute_action" | "execute_closing_commands" | "set_name" | "set_skin" | "set_interact_text" | "execute_opening_commands" | undefined;
		/** SceneName is the name of the scene. Versions: 1.17.10 – 1.26.60 */
		scene_name?: string | undefined;
	};
	/**
	 * PhotoTransfer is sent by the server to transfer a photo (image) file to the client. It is typically used
	 * to transfer photos so that the client can display it in a portfolio in Education Edition.
	 * While previously usable in the default Bedrock Edition, the displaying of photos in books was disabled and
	 * the packet now has little use anymore.
	 */
	export type packet_photo_transfer = {
		/** Versions: 1.16.201 – 1.16.210 */
		file_name?: string | undefined;
		/** PhotoData is the raw data of the photo image. The format of this data may vary: Formats such as JPEG or PNG work, as long as PhotoName has the correct extension. */
		image_data: string;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown2?: string | undefined;
		/** PhotoName is the name of the photo to transfer. It is the exact file name that the client will download the photo as, including the extension of the file. Versions: 1.16.220 – 1.26.60 */
		image_name?: string | undefined;
		/** BookID is the ID of the book that the photo is associated with. If the PhotoName in a book with this ID is set to PhotoName, it will display the photo (provided Education Edition is used). The photo image is downloaded to a sub-folder with this book ID. Versions: 1.16.220 – 1.26.60 */
		book_id?: string | undefined;
		/** PhotoType is one of the three photo types above. Versions: 1.17.30 – 1.26.60 */
		photo_type?: number | undefined;
		/** SourceType is the source photo type. It is one of the three photo types above. Versions: 1.17.30 – 1.26.60 */
		source_type?: number | undefined;
		/** OwnerEntityUniqueID is the entity unique ID of the photo's owner. Versions: 1.17.30 – 1.26.60 */
		owner_entity_unique_id?: Int64Write | undefined;
		/** NewPhotoName is the new name of the photo. Versions: 1.17.30 – 1.26.60 */
		new_photo_name?: string | undefined;
	};
	/**
	 * ModalFormRequest is sent by the server to make the client open a form. This form may be either a modal form
	 * which has two options, a menu form for a selection of options and a custom form for properties.
	 */
	export type packet_modal_form_request = {
		/** FormID is an ID used to identify the form. The ID is saved by the client and sent back when the player submits the form, so that the server can identify which form was submitted. */
		form_id: number;
		/** FormData is a JSON encoded object of form data. The content of the object differs, depending on the type of the form sent, which is also set in the JSON. */
		data: string;
	};
	/**
	 * ModalFormResponse is sent by the client in response to a ModalFormRequest, after the player has submitted
	 * the form sent. It contains the options/properties selected by the player, or a JSON encoded 'null' if
	 * the form was closed by clicking the X at the top right corner of the form.
	 */
	export type packet_modal_form_response = {
		/** FormID is the form ID of the form the client has responded to. It is the same as the ID sent in the ModalFormRequest, and may be used to identify which form was submitted. */
		form_id: number;
		/** ResponseData is a JSON encoded value representing the response of the player. For a modal form, the response is either true or false, for a menu form, the response is an integer specifying the index of the button clicked, and for a custom form, the response is an array containing a value for each element. */
		data?: string | undefined;
		/** HasResponseData is true if the client provided response data. Versions: 1.19.20 – 1.26.60 */
		has_response_data?: boolean | undefined;
		/** HasCancelReason is true if the client provided a reason for the form being cancelled. Versions: 1.19.20 – 1.26.60 */
		has_cancel_reason?: boolean | undefined;
		/** Versions: 1.19.20 – 1.26.60 */
		cancel_reason?: "closed" | "busy" | number | undefined;
	};
	/**
	 * ServerSettingsRequest is sent by the client to request the settings specific to the server. These settings
	 * are shown in a separate tab client-side, and have the same structure as a custom form.
	 * ServerSettingsRequest has no fields.
	 */
	export type packet_server_settings_request = Record<string, never>;
	export type packet_server_settings_response = {
		form_id: number;
		data: string;
	};
	export type packet_show_profile = {
		xuid: string;
	};
	export type packet_set_default_game_type = {
		gamemode: GameMode;
	};
	export type packet_remove_objective = {
		objective_name: string;
	};
	export type packet_set_display_objective = {
		display_slot: string;
		objective_name: string;
		display_name: string;
		criteria_name: string;
		sort_order: number;
	};
	export type packet_set_score = {
		entries: ScoreEntries | {
			scoreboard_id: bigint | number;
			objective_name: string;
			score: number;
			entry_type?: "player" | "entity" | "fake_player" | number | undefined;
			entity_unique_id?: bigint | number | undefined;
			custom_name?: string | undefined;
		}[] | {
			entry_type: "remove" | "player" | "entity" | "fake_player" | number;
			entry_type_name: string;
			scoreboard_id: bigint | number;
			objective_name?: string | undefined;
			score?: number | undefined;
			custom_name?: string | undefined;
			entity_unique_id?: bigint | number | undefined;
		}[];
		/** Versions: 1.16.220 – 1.26.30 */
		action?: "change" | "remove" | number | undefined;
	};
	/**
	 * LabTable is sent by the client to let the server know it started a chemical reaction in Education Edition,
	 * and is sent by the server to other clients to show the effects.
	 * The packet is only functional if Education features are enabled.
	 */
	export type packet_lab_table = {
		/** ActionType is the type of the action that was executed. It is one of the constants above. Typically, only LabTableActionCombine is sent by the client, whereas LabTableActionReact is sent by the server. */
		action_type: "combine" | "react" | "reset" | number;
		/** Position is the position at which the lab table used was located. */
		position: vec3i;
		/** ReactionType is the type of the reaction that took place as a result of the items put into the lab table. The reaction type can be either that of an item or a particle, depending on whatever the result was of the reaction. */
		reaction_type: number;
	};
	/**
	 * UpdateBlockSynced is sent by the server to synchronise the falling of a falling block entity with the
	 * transitioning back and forth from and to a solid block. It is used to prevent the entity from flickering,
	 * and is used in places such as the pushing of blocks with pistons.
	 */
	export type packet_update_block_synced = {
		/** Versions: 1.16.201 */
		coordinates?: BlockCoordinates | undefined;
		/** NewBlockRuntimeID is the runtime ID of the block that is placed at Position after sending the packet to the client. */
		block_runtime_id: number;
		/** Versions: 1.16.201 */
		block_priority?: number | undefined;
		/** Versions: 1.16.201 */
		data_layer_id?: number | undefined;
		/** Versions: 1.16.201 */
		unknown0?: number | undefined;
		/** Versions: 1.16.201 */
		unknown1?: number | undefined;
		/** Position is the block position at which a block is updated. Versions: 1.16.210 – 1.26.60 */
		position?: BlockCoordinates | undefined;
		/** Flags is a combination of flags that specify the way the block is updated client-side. It is a combination of the flags above, but typically sending only the BlockUpdateNetwork flag is sufficient. Versions: 1.16.210 – 1.26.60 */
		flags?: UpdateBlockFlags | undefined;
		/** Layer is the world layer on which the block is updated. For most blocks, this is the first layer, as that layer is the default layer to place blocks on, but for blocks inside of each other, this differs. Versions: 1.16.210 – 1.26.60 */
		layer?: number | undefined;
		/** EntityUniqueID is the unique ID of the falling block entity that the block transitions to or that the entity transitions from. Note that for both possible values for TransitionType, the EntityUniqueID should point to the falling block entity involved. Versions: 1.16.210 – 1.26.60 */
		entity_unique_id?: bigint | number | undefined;
		/** TransitionType is the type of the transition that happened. It is either BlockToEntityTransition, when a block placed becomes a falling entity, or EntityToBlockTransition, when a falling entity hits the ground and becomes a solid block again. Versions: 1.16.210 – 1.26.60 */
		transition_type?: "entity" | "create" | "destroy" | bigint | number | number | undefined;
	};
	/**
	 * MoveActorDelta is sent by the server to move an entity. The packet is specifically optimised to save as
	 * much space as possible, by only writing non-zero fields.
	 * As of 1.16.100, this packet no longer actually contains any deltas.
	 */
	export type packet_move_entity_delta = {
		/** EntityRuntimeID is the runtime ID of the entity that is being moved. The packet works provided a non-player entity with this runtime ID is present. */
		runtime_entity_id: bigint | number;
		/** Versions: 1.16.201 – 1.26.30 */
		flags?: DeltaMoveFlags | undefined;
		x?: number | undefined;
		y?: number | undefined;
		z?: number | undefined;
		rot_x?: number | undefined;
		rot_y?: number | undefined;
		rot_z?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		on_ground?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		force_move?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		force_move_local_entity?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		force_completion?: boolean | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		ticks?: bigint | number | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.26.30
	 */
	export type DeltaMoveFlags = {
		/** Versions: 1.16.201 – 1.26.30 */
		_value?: number | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		has_x?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		has_y?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		has_z?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		has_rot_x?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		has_rot_y?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		has_rot_z?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		on_ground?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		teleport?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		force_move?: boolean | undefined;
	};
	/**
	 * SetScoreboardIdentity is sent by the server to change the identity type of one of the entries on a
	 * scoreboard. This is used to change, for example, an entry pointing to a player, to a fake player when it
	 * leaves the server, and to change it back to a real player when it joins again.
	 * In non-vanilla situations, the packet is quite useless.
	 */
	export type packet_set_scoreboard_identity = {
		/** Entries is a list of all entries in the packet. Each of these entries points to one of the entries on a scoreboard. Depending on ActionType, their identity will either be registered or cleared. */
		entries: ScoreboardIdentityEntries | {
			scoreboard_id: bigint | number;
			entity_unique_id?: bigint | number | undefined;
		}[];
		/** ActionType is the type of the action to execute. The action is either ScoreboardIdentityActionRegister to associate an identity with the entry, or ScoreboardIdentityActionClear to remove associations with an entity. Versions: 1.16.220 – 1.26.60 */
		action?: "register_identity" | "clear_identity" | number | undefined;
	};
	/**
	 * SetLocalPlayerAsInitialised is sent by the client in response to a PlayStatus packet with the status set
	 * to spawn. The packet marks the moment at which the client is fully initialised and can receive any packet
	 * without discarding it.
	 */
	export type packet_set_local_player_as_initialized = {
		/** EntityRuntimeID is the entity runtime ID the player was assigned earlier in the login sequence in the StartGame packet. */
		runtime_entity_id: bigint | number;
	};
	/**
	 * UpdateSoftEnum is sent by the server to update a soft enum, also known as a dynamic enum, previously sent
	 * in the AvailableCommands packet. It is sent whenever the enum should get new options or when some of its
	 * options should be removed.
	 * The UpdateSoftEnum packet will apply for enums that have been set in the AvailableCommands packet with the
	 * 'Dynamic' field of the CommandEnum set to true.
	 */
	export type packet_update_soft_enum = {
		/** EnumType is the type of the enum. This type must be identical to the one set in the AvailableCommands packet, because the client uses this to recognise which enum to update. */
		enum_type: string;
		/** Options is a list of options that should be updated. Depending on the ActionType field, either these options will be added to the enum, the enum options will be set to these options or all of these options will be removed from the enum. */
		options: string[];
		/** ActionType is the type of the action to execute on the enum. The Options field has a different result, depending on what ActionType is used. */
		action_type: "add" | "remove" | "update" | number;
	};
	/**
	 * NetworkStackLatency is sent by the server (and the client, on development builds) to measure the latency
	 * over the entire Minecraft stack, rather than the RakNet latency. It has other usages too, such as the
	 * ability to be used as some kind of acknowledgement packet, to know when the client has received a certain
	 * other packet.
	 */
	export type packet_network_stack_latency = {
		/** Timestamp is the timestamp of the network stack latency packet. The client will, if NeedsResponse is set to true, send a NetworkStackLatency packet with this same timestamp packet in response. */
		timestamp: Int64Write;
		/** Versions: 1.16.201 – 1.16.210 */
		unknown_flag?: number | undefined;
		/** NeedsResponse specifies if the sending side of this packet wants a response to the packet, meaning that the other side should send a NetworkStackLatency packet back. Versions: 1.16.220 – 1.26.60 */
		needs_response?: number | undefined;
	};
	/**
	 * ScriptCustomEvent is sent by both the client and the server. It is a way to let scripts communicate with
	 * the server, so that the client can let the server know it triggered an event, or the other way around.
	 * It is essentially an RPC kind of system.
	 * Deprecated: ScriptCustomEvent is deprecated as of 1.20.10.
	 */
	export type packet_script_custom_event = {
		/** EventName is the name of the event. The script and the server will use this event name to identify the data that is sent. */
		event_name: string;
		/** EventData is the data of the event. This data is typically a JSON encoded string, that the script is able to encode and decode too. */
		event_data: string;
	};
	/**
	 * SpawnParticleEffect is sent by the server to spawn a particle effect client-side. Unlike other packets that
	 * result in the appearing of particles, this packet can show particles that are not hardcoded in the client.
	 * They can be added and changed through behaviour packs to implement custom particles.
	 */
	export type packet_spawn_particle_effect = {
		/** Versions: 1.16.201 – 1.16.210 */
		dimension_id?: number | undefined;
		/** EntityUniqueID is the unique ID of the entity that the spawned particle may be attached to. If this ID is not -1, the Position below will be interpreted as relative to the position of the entity associated with this unique ID. */
		entity_id: bigint | number;
		/** Position is the position that the particle should be spawned at. If the position is too far away from the player, it will not show up. If EntityUniqueID is not -1, the position will be relative to the position of the entity. */
		position: vec3f;
		/** ParticleName is the name of the particle that should be shown. This name may point to a particle effect that is built-in, or to one implemented by behaviour packs. */
		particle_name: string;
		/** Dimension is the dimension that the particle is spawned in. Its exact usage is not clear, as the dimension has no direct effect on the particle. Versions: 1.16.220 – 1.26.60 */
		dimension?: number | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		molang_variables?: string | undefined;
	};
	/**
	 * AvailableActorIdentifiers is sent by the server at the start of the game to let the client know all
	 * entities that are available on the server.
	 */
	export type packet_available_entity_identifiers = {
		/** SerialisedEntityIdentifiers is a network NBT serialised compound of all entity identifiers that are available in the server. */
		nbt: NBT;
	};
	/**
	 * Not used. Use `packet_level_sound_event`.
	 */
	export type packet_level_sound_event_v2 = {
		sound_id: number;
		position: vec3f;
		block_id: number;
		entity_type: string;
		is_baby_mob: boolean;
		is_global: boolean;
	};
	/**
	 * NetworkChunkPublisherUpdate is sent by the server to change the point around which chunks are and remain
	 * loaded. This is useful for mini-game servers, where only one area is ever loaded, in which case the
	 * NetworkChunkPublisherUpdate packet can be sent in the middle of it, so that no chunks ever need to be
	 * additionally sent during the course of the game.
	 * In reality, the packet is not extraordinarily useful, and most servers just send it constantly at the
	 * position of the player.
	 * If the packet is not sent at all, no chunks will be shown to the player, regardless of where they are sent.
	 */
	export type packet_network_chunk_publisher_update = {
		/** Position is the block position around which chunks loaded will remain shown to the client. Most servers set this position to the position of the player itself. #TODO: Check putSignedBlockPosition */
		coordinates: BlockCoordinates;
		/** Radius is the radius in blocks around Position that chunks sent show up in and will remain loaded in. Unlike the RequestChunkRadius and ChunkRadiusUpdated packets, this radius is in blocks rather than chunks, so the chunk radius needs to be multiplied by 16. (Or shifted to the left by 4.) */
		radius: number;
		/** Versions: 1.19.20 – 1.26.60 */
		saved_chunks?: {
			/** ChunkX is the X coordinate of the chunk sent. (To translate a block's X to a chunk's X: x >> 4) */
			x: number;
			/** ChunkZ is the Z coordinate of the chunk sent. (To translate a block's Z to a chunk's Z: z >> 4) */
			z: number;
		}[] | undefined;
	};
	/**
	 * BiomeDefinitionList is sent by the server to let the client know all biomes that are available and
	 * implemented on the server side. It is much like the AvailableActorIdentifiers packet, but instead
	 * functions for biomes.
	 */
	export type packet_biome_definition_list = {
		/** Versions: 1.16.201 – 1.21.70 */
		nbt?: NBT | undefined;
		/** BiomeDefinitions is a list of biomes that are available on the server. Versions: 1.21.80 – 1.26.60 */
		biome_definitions?: BiomeDefinition[] | undefined;
		/** StringList is a makeshift dictionary implementation Mojang created to try and reduce the size of the overall packet. It is a list of common strings that are used in the biome definitions. Versions: 1.21.80 – 1.26.60 */
		string_list?: string[] | undefined;
	};
	/**
	 * LevelSoundEvent is sent by the server to make any kind of built-in sound heard to a player. It is sent to,
	 * for example, play a stepping sound or a shear sound. The packet is also sent by the client, in which case
	 * it could be forwarded by the server to the other players online. If possible, the packets from the client
	 * should be ignored however, and the server should play them on its own accord.
	 */
	export type packet_level_sound_event = {
		/** SoundType is the type of the sound to play. Some of the sound types require additional data, which is set in the EventData field. */
		sound_id: number | SoundType | SoundEventIdentifier;
		/** Position is the position of the sound event. The player will be able to hear the direction of the sound based on what position is sent here. */
		position: vec3f;
		/** Versions: 1.16.201 – 1.16.210 */
		block_id?: number | undefined;
		/** EntityType is the string entity type of the entity that emitted the sound, for example 'minecraft:skeleton'. Some sound types use this entity type for additional data. */
		entity_type: string;
		/** BabyMob specifies if the sound should be that of a baby mob. It is most notably used for parrot imitations, which will change based on if this field is set to true or not. */
		is_baby_mob: boolean;
		/** DisableRelativeVolume specifies if the sound should be played relatively or not. If set to true, the sound will have full volume, regardless of where the Position is, whereas if set to false, the sound's volume will be based on the distance to Position. */
		is_global: boolean;
		/** ExtraData is a packed integer that some sound types use to provide extra data. An example of this is the note sound, which is composed of a pitch and an instrument type. Versions: 1.16.220 – 1.26.60 */
		extra_data?: number | undefined;
		/** EntityUniqueID is the unique ID of a source entity. The unique ID is a value that remains consistent across different sessions of the same world, but most servers simply fill the runtime ID of the entity out for this field. Versions: 1.21.70 – 1.26.60 */
		entity_unique_id?: Int64Write | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		fire_at_position?: vec3f | undefined;
	};
	/**
	 * LevelEventGeneric is sent by the server to send a 'generic' level event to the client. This packet sends an
	 * NBT serialised object and may for that reason be used for any event holding additional data.
	 */
	export type packet_level_event_generic = {
		/** EventID is a unique identifier that identifies the event called. The data that follows has fields in the NBT depending on what event it is. */
		event_id: number;
		/** SerialisedEventData is a network little endian serialised object of event data, with fields that vary depending on EventID. Unlike many other NBT structures, this data is not actually in a compound but just loosely floating NBT tags. To decode using the nbt package, you would need to append 0x0a00 at the start (compound id and name length) and add 0x00 at the end, to manually wrap it in a compound. Likewise, you would have to remove these bytes when encoding. */
		nbt: NamedTag[];
	};
	/**
	 * LecternUpdate is sent by the client to update the server on which page was opened in a book on a lectern,
	 * or if the book should be removed from it.
	 */
	export type packet_lectern_update = {
		/** Page is the page number in the book that was opened by the player on the lectern. */
		page: number;
		/** PageCount is the number of pages that the book opened in the lectern has. */
		page_count: number;
		/** Position is the position of the lectern that was updated. If no lectern is at the block position, the packet should be ignored. */
		position: vec3i;
		/** Versions: 1.16.201 – 1.20.61 */
		drop_book?: boolean | undefined;
	};
	/**
	 * This packet was removed.
	 */
	export type packet_video_stream_connect = {
		server_uri: string;
		frame_send_frequency: number;
		action: "none" | "close" | number;
		resolution_x: number;
		resolution_y: number;
	};
	/**
	 * Versions: 1.16.201 – 1.20.50
	 */
	export type packet_add_ecs_entity = {
		/** Versions: 1.16.201 – 1.20.50 */
		network_id: bigint | number;
	};
	/**
	 * Versions: 1.16.201 – 1.20.50
	 */
	export type packet_remove_ecs_entity = {
		/** Versions: 1.16.201 – 1.20.50 */
		network_id: bigint | number;
	};
	/**
	 * ClientCacheStatus is sent by the client to the server at the start of the game. It is sent to let the
	 * server know if it supports the client-side blob cache. Clients such as Nintendo Switch do not support the
	 * cache, and attempting to use it anyway will fail.
	 */
	export type packet_client_cache_status = {
		/** Enabled specifies if the blob cache is enabled. If false, the server should not attempt to use the blob cache. If true, it may do so, but it may also choose not to use it. */
		enabled: boolean;
	};
	/**
	 * OnScreenTextureAnimation is sent by the server to show a certain animation on the screen of the player.
	 * The packet is used, as an example, for when a raid is triggered and when a raid is defeated.
	 */
	export type packet_on_screen_texture_animation = {
		/** AnimationType is the type of the animation to show. The packet provides no further extra data to allow modifying the duration or other properties of the animation. Versions: 1.16.220 – 1.26.60 */
		animation_type?: number | undefined;
	};
	/**
	 * MapCreateLockedCopy is sent by the server to create a locked copy of one map into another map. In vanilla,
	 * it is used in the cartography table to create a map that is locked and cannot be modified.
	 */
	export type packet_map_create_locked_copy = {
		/** OriginalMapID is the ID of the map that is being copied. The locked copy will obtain all content that is visible on this map, except the content will not change. Versions: 1.16.220 – 1.26.60 */
		original_map_id?: bigint | number | undefined;
		/** NewMapID is the ID of the map that holds the locked copy of the map that OriginalMapID points to. Its contents will be impossible to change. Versions: 1.16.220 – 1.26.60 */
		new_map_id?: bigint | number | undefined;
	};
	/**
	 * StructureTemplateDataRequest is sent by the client to request data of a structure.
	 */
	export type packet_structure_template_data_export_request = {
		/** StructureName is the name of the structure that was set in the structure block's UI. This is the name used to export the structure to a file. Versions: 1.16.220 – 1.26.60 */
		name?: string | undefined;
		/** Position is the position of the structure block that has its template data requested. Versions: 1.16.220 – 1.26.60 */
		position?: BlockCoordinates | undefined;
		/** Settings is a struct of settings that should be used for exporting the structure. These settings are identical to the last sent in the StructureBlockUpdate packet by the client. Versions: 1.16.220 – 1.26.60 */
		settings?: StructureBlockSettings | undefined;
		/** RequestType specifies the type of template data request that the player sent. Versions: 1.16.220 – 1.26.60 */
		request_type?: "export_from_save" | "export_from_load" | "query_saved_structure" | number | "import_from_save" | undefined;
	};
	/**
	 * StructureTemplateDataResponse is sent by the server to send data of a structure to the client in response
	 * to a StructureTemplateDataRequest packet.
	 */
	export type packet_structure_template_data_export_response = {
		/** Versions: 1.16.220 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		success?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		nbt?: NBT | undefined;
		/** ResponseType specifies the response type of the packet. This depends on the RequestType field sent in the StructureTemplateDataRequest packet and is one of the constants above. Versions: 1.16.220 – 1.26.60 */
		response_type?: "export" | "query" | number | "import" | undefined;
	};
	/**
	 * No longer used.
	 */
	export type packet_update_block_properties = {
		nbt: NBT;
	};
	/**
	 * ClientCacheBlobStatus is part of the blob cache protocol. It is sent by the client to let the server know
	 * what blobs it needs and which blobs it already has, in an ACK type system.
	 */
	export type packet_client_cache_blob_status = {
		/** Versions: 1.16.201 – 1.26.20 */
		misses?: number | undefined;
		/** Versions: 1.16.201 – 1.26.20 */
		haves?: number | undefined;
		/** A list of blob hashes that the client does not have a blob available for. The server should send the blobs matching these hashes as soon as possible. */
		missing: Int64Write[];
		/** A list of hashes that the client does have a cached blob for. Server doesn't need to send. */
		have: Int64Write[];
	};
	/**
	 * ClientCacheMissResponse is part of the blob cache protocol. It is sent by the server in response to a
	 * ClientCacheBlobStatus packet and contains the blob data of all blobs that the client acknowledged not to
	 * have yet.
	 */
	export type packet_client_cache_miss_response = {
		blobs: Blob[];
	};
	/**
	 * EducationSettings is a packet sent by the server to update Minecraft: Education Edition related settings.
	 * It is unused by the normal base game.
	 */
	export type packet_education_settings = {
		/** CodeBuilderDefaultURI is the default URI that the code builder is ran on. Using this, a Code Builder program can make code directly affect the server. */
		CodeBuilderDefaultURI: string;
		/** CodeBuilderTitle is the title of the code builder shown when connected to the CodeBuilderDefaultURI. */
		CodeBuilderTitle: string;
		/** CanResizeCodeBuilder specifies if clients connected to the world should be able to resize the code builder when it is opened. */
		CanResizeCodeBuilder: boolean;
		HasOverrideURI: boolean;
		OverrideURI?: string | undefined;
		HasQuiz: boolean;
		/** Versions: 1.17.30 – 1.26.60 */
		disable_legacy_title_bar?: boolean | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		post_process_filter?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		screenshot_border_path?: string | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		has_agent_capabilities?: boolean | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		agent_capabilities?: {
			has?: boolean | undefined;
			can_modify_blocks?: boolean | undefined;
		} | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		has_external_link_settings?: boolean | undefined;
		/** Versions: 1.17.30 – 1.26.60 */
		external_link_settings?: {
			has: boolean;
			url: string;
			display_name: string;
		} | undefined;
	};
	/**
	 * Emote is sent by both the server and the client. When the client sends an emote, it sends this packet to
	 * the server, after which the server will broadcast the packet to other players online.
	 */
	export type packet_emote = {
		/** EntityRuntimeID is the entity that sent the emote. When a player sends this packet, it has this field set as its own entity runtime ID. */
		entity_id: bigint | number;
		/** EmoteID is the ID of the emote to send. */
		emote_id: string;
		/** Flags is a combination of flags that change the way the Emote packet operates. When the server sends this packet to other players, EmoteFlagServerSide must be present. */
		flags: number | "server_side" | "mute_chat";
		/** XUID is the Xbox User ID of the player that sent the emote. It is only set when the emote is used by a player that is authenticated with Xbox Live. Versions: 1.20.0 – 1.26.60 */
		xuid?: string | undefined;
		/** PlatformID is an identifier only set for particular platforms when using an emote (presumably only for Nintendo Switch). It is otherwise an empty string, and is used to decide which players are able to emote with each other. Versions: 1.20.0 – 1.26.60 */
		platform_id?: string | undefined;
		/** EmoteLength is the number of ticks that the emote lasts for. Versions: 1.21.30 – 1.26.60 */
		emote_length_ticks?: number | undefined;
	};
	/**
	 * MultiPlayerSettings is sent by the client to update multi-player related settings server-side and sent back
	 * to online players by the server.
	 * The MultiPlayerSettings packet is a Minecraft: Education Edition packet. It has no functionality for the
	 * base game.
	 */
	export type packet_multiplayer_settings = {
		/** ActionType is the action that should be done when this packet is sent. It is one of the constants that may be found above. */
		action_type: "enable_multiplayer" | "disable_multiplayer" | "refresh_join_code" | number;
	};
	/**
	 * SettingsCommand is sent by the client when it changes a setting in the settings that results in the issuing
	 * of a command to the server, such as when Show Coordinates is enabled.
	 */
	export type packet_settings_command = {
		/** CommandLine is the full command line that was sent to the server as a result of the setting that the client changed. */
		command_line: string;
		/** SuppressOutput specifies if the client requests the suppressing of the output of the command that was executed. Generally this is set to true, as the client won't need a message to confirm the output of the change. */
		suppress_output: boolean;
	};
	/**
	 * AnvilDamage is sent by the client to request the dealing damage to an anvil. This packet is completely
	 * pointless and the server should never listen to it.
	 */
	export type packet_anvil_damage = {
		/** Versions: 1.16.201 – 1.26.30 */
		damage?: number | undefined;
		/** AnvilPosition is the position in the world that the anvil can be found at. */
		position: BlockCoordinates;
	};
	/**
	 * CompletedUsingItem is sent by the server to tell the client that it should be done using the item it is
	 * currently using.
	 */
	export type packet_completed_using_item = {
		/** UsedItemID is the item ID of the item that the client completed using. This should typically be the ID of the item held in the hand. */
		used_item_id: number;
		/** UseMethod is the method of the using of the item that was completed. It is one of the constants that may be found above. */
		use_method: "equip_armor" | "eat" | "attack" | "consume" | "throw" | "shoot" | "place" | "fill_bottle" | "fill_bucket" | "pour_bucket" | "use_tool" | "interact" | "retrieved" | "dyed" | "traded" | number | "brushing_completed" | "opened_vault";
	};
	/**
	 * NetworkSettings is sent by the server to update a variety of network settings. These settings modify the
	 * way packets are sent over the network stack.
	 */
	export type packet_network_settings = {
		/** CompressionThreshold is the minimum size of a packet that is compressed when sent. If the size of a packet is under this value, it is not compressed. When set to 0, all packets will be left uncompressed. */
		compression_threshold: number;
		/** CompressionAlgorithm is the algorithm that is used to compress packets. Versions: 1.19.30 – 1.26.60 */
		compression_algorithm?: "deflate" | "snappy" | number | undefined;
		/** ClientThrottle regulates whether the client should throttle players when exceeding of the threshold. Players outside threshold will not be ticked, improving performance on low-end devices. Versions: 1.19.30 – 1.26.60 */
		client_throttle?: boolean | undefined;
		/** ClientThrottleThreshold is the threshold for client throttling. If the number of players exceeds this value, the client will throttle players. Versions: 1.19.30 – 1.26.60 */
		client_throttle_threshold?: number | undefined;
		/** ClientThrottleScalar is the scalar for client throttling. The scalar is the amount of players that are ticked when throttling is enabled. Versions: 1.19.30 – 1.26.60 */
		client_throttle_scalar?: number | undefined;
	};
	/**
	 * PlayerAuthInput is sent by the client to allow for server authoritative movement. It is used to synchronise
	 * the player input with the position server-side.
	 * The client sends this packet when the ServerAuthoritativeMovementMode field in the StartGame packet is set
	 * to true, instead of the MovePlayer packet. The client will send this packet once every tick.
	 */
	export type packet_player_auth_input = {
		/** Pitch that the player reports it has. */
		pitch: number;
		/** Yaw that player reports it has. */
		yaw: number;
		/** Position holds the position that the player reports it has. */
		position: vec3f;
		/** MoveVector is a Vec2 that specifies the direction in which the player moved, as a combination of X/Z values which are created using the WASD/controller stick state. */
		move_vector: vec2f;
		/** HeadYaw is the horizontal rotation of the head that the player reports it has. */
		head_yaw: number;
		/** InputData specifies the way the player moved last tick. As of 1.26.40 it is an optional list of InputData values instead of a bitfield. */
		input_data?: InputFlag | InputData[] | undefined;
		/** InputMode specifies the way that the client inputs data to the screen. It is one of the constants that may be found above. */
		input_mode: "mouse" | "touch" | "game_pad" | "motion_controller" | number | "unknown";
		/** PlayMode specifies the way that the player is playing. The values it holds, which are rather random, may be found above. */
		play_mode: "normal" | "teaser" | "screen" | "viewer" | "reality" | "placement" | "living_room" | "exit_level" | "exit_level_living_room" | "num_modes" | number;
		/** Versions: 1.16.201 – 1.21.30 */
		gaze_direction?: vec3f | undefined;
		/** Tick is the server tick at which the packet was sent. It is used in relation to CorrectPlayerMovePrediction. */
		tick: bigint | number;
		/** Delta was the delta between the old and the new position. There isn't any practical use for this field as it can be calculated by the server itself. */
		delta: vec3f;
		/** Versions: 1.16.210 – 1.26.60 */
		transaction?: {
			legacy: TransactionLegacy | TransactionLegacyAuthInput;
			actions?: TransactionActions | TransactionActionsAuthInput | undefined;
			data: TransactionUseItem;
			actions_presence?: boolean | undefined;
		} | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		item_stack_request?: ItemStackRequest | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		block_action?: {
			action: Action;
			position?: vec3i | undefined;
			face?: number | undefined;
		}[] | undefined;
		/** InteractionModel is a constant representing the interaction model the player is using. Versions: 1.19.1 – 1.26.60 */
		interaction_model?: "touch" | "crosshair" | "classic" | number | undefined;
		/** AnalogueMoveVector is a Vec2 that specifies the direction in which the player moved, as a combination of X/Z values which are created using an analogue input. Versions: 1.19.70 – 1.26.60 */
		analogue_move_vector?: vec2f | undefined;
		/** Versions: 1.20.61 – 1.26.60 */
		predicted_vehicle?: bigint | number | undefined;
		/** Versions: 1.20.71 – 1.26.60 */
		vehicle_rotation?: vec2f | undefined;
		/** interact_rotation is the rotation the player is looking that they intend to use for interactions. This is only different to Pitch and Yaw in cases such as VR or when custom cameras being used. Versions: 1.21.42 – 1.26.60 */
		interact_rotation?: vec2f | undefined;
		/** CameraOrientation is the vector that represents the camera's forward direction which can be used to transform movement to be camera relative. Versions: 1.21.42 – 1.26.60 */
		camera_orientation?: vec3f | undefined;
		/** RawMoveVector is the value of MoveVector before it is affected by input permissions, sneaking/fly speeds and isn't normalised for analogue inputs. Versions: 1.21.50 – 1.26.60 */
		raw_move_vector?: vec2f | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		transaction_presence?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		item_stack_request_presence?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		block_action_presence?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		vehicle_rotation_presence?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.45 */
		predicted_vehicle_presence?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.26.30
	 */
	export type InputFlag = {
		/** Versions: 1.16.201 – 1.26.30 */
		_value?: number | bigint | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		ascend?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		descend?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		north_jump?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		jump_down?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		sprint_down?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		change_height?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		jumping?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		auto_jumping_in_water?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		sneaking?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		sneak_down?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		up?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		down?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		left?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		right?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		up_left?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		up_right?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		want_up?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		want_down?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		want_down_slow?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		want_up_slow?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		sprinting?: boolean | undefined;
		/** Versions: 1.16.201 – 1.17.0 */
		ascend_scaffolding?: boolean | undefined;
		/** Versions: 1.16.201 – 1.17.0 */
		descend_scaffolding?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		sneak_toggle_down?: boolean | undefined;
		/** Versions: 1.16.201 – 1.26.30 */
		persist_sneak?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_sprinting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		stop_sprinting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_sneaking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		stop_sneaking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_swimming?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		stop_swimming?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_jumping?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		start_gliding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		stop_gliding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		item_interact?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		block_action?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.30 */
		item_stack_request?: boolean | undefined;
		/** Versions: 1.17.10 – 1.26.30 */
		ascend_block?: boolean | undefined;
		/** Versions: 1.17.10 – 1.26.30 */
		descend_block?: boolean | undefined;
		/** Versions: 1.19.60 – 1.26.30 */
		handled_teleport?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.30 */
		emoting?: boolean | undefined;
		/** Versions: 1.20.10 – 1.26.30 */
		missed_swing?: boolean | undefined;
		/** Versions: 1.20.10 – 1.26.30 */
		start_crawling?: boolean | undefined;
		/** Versions: 1.20.10 – 1.26.30 */
		stop_crawling?: boolean | undefined;
		/** Versions: 1.20.30 – 1.26.30 */
		start_flying?: boolean | undefined;
		/** Versions: 1.20.30 – 1.26.30 */
		stop_flying?: boolean | undefined;
		/** Versions: 1.20.40 – 1.26.30 */
		received_server_data?: boolean | undefined;
		/** Versions: 1.20.61 – 1.26.30 */
		client_predicted_vehicle?: boolean | undefined;
		/** Versions: 1.20.71 – 1.26.30 */
		paddling_left?: boolean | undefined;
		/** Versions: 1.20.71 – 1.26.30 */
		paddling_right?: boolean | undefined;
		/** Versions: 1.21.0 – 1.26.30 */
		block_breaking_delay_enabled?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.30 */
		horizontal_collision?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.30 */
		vertical_collision?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.30 */
		down_left?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.30 */
		down_right?: boolean | undefined;
		/** Versions: 1.21.42 – 1.26.30 */
		camera_relative_movement_enabled?: boolean | undefined;
		/** Versions: 1.21.42 – 1.26.30 */
		rot_controlled_by_move_direction?: boolean | undefined;
		/** Versions: 1.21.42 – 1.26.30 */
		start_spin_attack?: boolean | undefined;
		/** Versions: 1.21.42 – 1.26.30 */
		stop_spin_attack?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		start_using_item?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		hotbar_only_touch?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		jump_released_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		jump_pressed_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		jump_current_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		sneak_released_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		sneak_pressed_raw?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.30 */
		sneak_current_raw?: boolean | undefined;
	};
	/**
	 * CreativeContent is a packet sent by the server to set the creative inventory's content for a player.
	 * Introduced in 1.16, this packet replaces the previous method - sending an InventoryContent packet with
	 * creative inventory window ID.
	 * As of v1.16.100, this packet must be sent during the login sequence. Not sending it will stop the client
	 * from joining the server.
	 */
	export type packet_creative_content = {
		/** Individual items that are displayed within the creative inventory menu, grouped by their category. */
		items: ItemStacks | {
			/** The index of the item in the creative menu. */
			entry_id: number;
			item: ItemLegacy;
		}[] | {
			/** The index of the item in the creative menu. */
			entry_id: number;
			item: ItemLegacy;
			/** The group index of the item - which group in the groups array this item belongs to. */
			group_index: number;
		}[];
		/** The groups that are displayed within the creative inventory menu. Versions: 1.21.60 – 1.26.60 */
		groups?: {
			/** Where the group shows up in the creative inventory (e.g. Construction, Items, etc) As of 1.26.40 this is a single byte instead of a little endian int. */
			category: "all" | "construction" | "nature" | "equipment" | "items" | "item_command_only" | number;
			/** The name of the group (e.g. Decorative stone, Wool, etc.) */
			name: string;
			/** The item whose icon is used to label the group (icon you click on to open/close the group) */
			icon_item: ItemLegacy;
		}[] | undefined;
	};
	/**
	 * PlayerEnchantOptions is sent by the server to update the enchantment options displayed when the user opens
	 * the enchantment table and puts an item in. This packet was added in 1.16 and allows the server to decide on
	 * the enchantments that can be selected by the player.
	 * The PlayerEnchantOptions packet should be sent once for every slot update of the enchantment table. The
	 * vanilla server sends an empty PlayerEnchantOptions packet when the player opens the enchantment table
	 * (air is present in the enchantment table slot) and sends the packet with actual enchantments in it when
	 * items are put in that can have enchantments.
	 */
	export type packet_player_enchant_options = {
		/** Versions: 1.16.201 – 1.16.210 */
		enchant_options?: EnchantOptions | undefined;
		/** Options is a list of possible enchantment options for the item that was put into the enchantment table. Versions: 1.16.220 – 1.26.60 */
		options?: EnchantOption[] | undefined;
	};
	/**
	 * ItemStackRequest is sent by the client to change item stacks in an inventory. It is essentially a
	 * replacement of the InventoryTransaction packet added in 1.16 for inventory specific actions, such as moving
	 * items around or crafting. The InventoryTransaction packet is still used for actions such as placing blocks
	 * and interacting with entities.
	 */
	export type packet_item_stack_request = {
		requests: ItemStackRequests | ItemStackRequest[];
	};
	/**
	 * ItemStackResponse is sent by the server in response to an ItemStackRequest packet from the client. This
	 * packet is used to either approve or reject ItemStackRequests from the client. If a request is approved, the
	 * client will simply continue as normal. If rejected, the client will undo the actions so that the inventory
	 * should be in sync with the server again.
	 */
	export type packet_item_stack_response = {
		/** Responses is a list of responses to ItemStackRequests sent by the client before. Responses either approve or reject a request from the client. Vanilla limits the size of this slice to 4096. */
		responses: ItemStackResponses;
	};
	/**
	 * PlayerArmourDamage is sent by the server to damage the armour of a player. It is a very efficient packet,
	 * but generally it's much easier to just send a slot update for the damaged armour.
	 */
	export type packet_player_armor_damage = {
		/** Versions: 1.16.201 – 1.21.100 */
		type?: ArmorDamageType | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		helmet_damage?: number | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		chestplate_damage?: number | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		leggings_damage?: number | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		boots_damage?: number | undefined;
		/** Versions: 1.21.20 – 1.21.100 */
		body_damage?: number | undefined;
		/** Versions: 1.21.111 – 1.26.60 */
		entries?: ArmorDamageEntry[] | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.21.100
	 */
	export type ArmorDamageType = {
		/** Versions: 1.16.201 – 1.21.100 */
		_value?: number | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		head?: boolean | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		chest?: boolean | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		legs?: boolean | undefined;
		/** Versions: 1.16.201 – 1.21.100 */
		feet?: boolean | undefined;
		/** Versions: 1.21.20 – 1.21.100 */
		body?: boolean | undefined;
	};
	/**
	 * CodeBuilder is an Education Edition packet sent by the server to the client to open the URL to a Code
	 * Builder (websocket) server.
	 */
	export type packet_code_builder = {
		/** URL is the url to the Code Builder (websocket) server. */
		url: string;
		/** ShouldOpenCodeBuilder specifies if the client should automatically open the Code Builder app. If set to true, the client will attempt to use the Code Builder app to connect to and interface with the server running at the URL above. */
		should_open_code_builder: boolean;
	};
	/**
	 * UpdatePlayerGameType is sent by the server to change the game mode of a player. It is functionally
	 * identical to the SetPlayerGameType packet.
	 */
	export type packet_update_player_game_type = {
		/** GameType is the new game type of the player. It is one of the constants that can be found in set_player_game_type.go. Some of these game types require additional flags to be set in an AdventureSettings packet for the game mode to obtain its full functionality. */
		gamemode: GameMode;
		/** PlayerUniqueID is the entity unique ID of the player that should have its game mode updated. If this packet is sent to other clients with the player unique ID of another player, nothing happens. */
		player_unique_id: bigint | number;
		/** Versions: 1.20.80 – 1.26.60 */
		tick?: number | bigint | number | undefined;
	};
	/**
	 * EmoteList is sent by the client every time it joins the server and when it equips new emotes. It may be
	 * used by the server to find out which emotes the client has available. If the player has no emotes equipped,
	 * this packet is not sent.
	 * Under certain circumstances, this packet is also sent from the server to the client, but I was unable to
	 * find when this is done.
	 */
	export type packet_emote_list = {
		/** PlayerRuntimeID is the runtime ID of the player that owns the emote pieces below. If sent by the client, this player runtime ID is always that of the player itself. */
		player_id: bigint | number;
		/** EmotePieces is a list of emote pieces that the player with the runtime ID above has. */
		emote_pieces: string[];
	};
	/**
	 * PositionTrackingDBClientRequest is a packet sent by the client to request the position and dimension of a
	 * 'tracking ID'. These IDs are tracked in a database by the server. In 1.16, this is used for lodestones.
	 * The client will send this request to find the position a lodestone compass needs to point to. If found, it
	 * will point to the lodestone. If not, it will start spinning around.
	 * A PositionTrackingDBServerBroadcast packet should be sent in response to this packet.
	 */
	export type packet_position_tracking_db_request = {
		/** RequestAction is the action that should be performed upon the receiving of the packet. It is one of the constants found above. */
		action: "query" | number;
		/** TrackingID is a unique ID used to identify the request. The server responds with a PositionTrackingDBServerBroadcast packet holding the same ID, so that the client can find out what that packet was in response to. */
		tracking_id: number;
	};
	/**
	 * PositionTrackingDBServerBroadcast is sent by the server in response to the
	 * PositionTrackingDBClientRequest packet. This packet is, as of 1.16, currently only used for lodestones. The
	 * server maintains a database with tracking IDs and their position and dimension. The client will request
	 * these tracking IDs, (NBT tag set on the lodestone compass with the tracking ID?) and the server will
	 * respond with the status of those tracking IDs.
	 * What is actually done with the data sent depends on what the client chooses to do with it. For the
	 * lodestone compass, it is used to make the compass point towards lodestones and to make it spin if the
	 * lodestone at a position is no longer there.
	 */
	export type packet_position_tracking_db_broadcast = {
		/** BroadcastAction specifies the status of the position tracking DB response. It is one of the constants above, specifying the result of the request with the ID below. The Update action is sent for setting the position of a lodestone compass, the Destroy and NotFound to indicate that there is not (no longer) a lodestone at that position. */
		broadcast_action: "update" | "destory" | "not_found" | number;
		/** TrackingID is the ID of the PositionTrackingDBClientRequest packet that this packet was in response to. The tracking ID is also present as the 'id' field in the SerialisedData field. */
		tracking_id: number;
		nbt: NBT;
	};
	/**
	 * DebugInfo is a packet sent by the server to the client. It does not seem to do anything when sent to the
	 * normal client in 1.16.
	 */
	export type packet_debug_info = {
		/** PlayerUniqueID is the unique ID of the player that the packet is sent to. */
		player_unique_id: bigint | number;
		/** Data is the debug data. */
		data: ByteArray;
	};
	/**
	 * PacketViolationWarning is sent by the client when it receives an invalid packet from the server. It holds
	 * some information on the error that occurred.
	 */
	export type packet_packet_violation_warning = {
		violation_type: "malformed" | number;
		/** Severity specifies the severity of the packet violation. The action the client takes after this violation depends on the severity sent. */
		severity: "warning" | "final_warning" | "terminating" | number;
		/** PacketID is the ID of the invalid packet that was received. */
		packet_id: number;
		/** ViolationContext holds a description on the violation of the packet. */
		reason: string;
	};
	/**
	 * MotionPredictionHints is sent by the server to the client. There is a predictive movement component for
	 * entities. This packet fills the "history" of that component and entity movement is computed based on the
	 * points. Vanilla sends this packet instead of the SetActorMotion packet when 'spatial optimisations' are
	 * enabled.
	 */
	export type packet_motion_prediction_hints = {
		/** EntityRuntimeID is the runtime ID of the entity whose velocity is sent to the client. */
		entity_runtime_id: bigint | number;
		/** Velocity is the server-calculated velocity of the entity at the point of sending the packet. */
		velocity: vec3f;
		/** OnGround specifies if the server currently thinks the entity is on the ground. */
		on_ground: boolean;
	};
	/**
	 * AnimateEntity is sent by the server to animate an entity client-side. It may be used to play a single
	 * animation, or to activate a controller which can start a sequence of animations based on different
	 * conditions specified in an animation controller.
	 * Much of the documentation of this packet can be found at
	 * https://learn.microsoft.com/minecraft/creator/reference/content/animationsreference.
	 */
	export type packet_animate_entity = {
		/** Animation is the name of a single animation to start playing. */
		animation: string;
		/** NextState is the first state to start with. These states are declared in animation controllers (which, in themselves, are animations too). These states in turn may have animations and transitions to move to a next state. */
		next_state: string;
		/** StopCondition is a MoLang expression that specifies when the animation should be stopped. */
		stop_condition: string;
		/** Controller is the animation controller that is used to manage animations. These controllers decide when to play which animation. */
		controller: string;
		/** How long to move from the previous animation to the next. */
		blend_out_time: number;
		/** EntityRuntimeIDs is list of runtime IDs of entities that the animation should be applied to. */
		runtime_entity_ids: bigint | number[];
		/** StopConditionVersion is the MoLang stop condition version. Versions: 1.17.30 – 1.26.60 */
		stop_condition_version?: Int64Write | number | undefined;
	};
	/**
	 * CameraShake is sent by the server to make the camera shake client-side. This feature was added for map-
	 * making partners.
	 */
	export type packet_camera_shake = {
		/** Intensity is the intensity of the shaking. The client limits this value to 4, so anything higher may not work. */
		intensity: number;
		/** Duration is the number of seconds the camera will shake for. */
		duration: number;
		/** Type is the type of shake, and is one of the constants listed above. The different type affects how the shake looks in game. */
		type: number;
		/** Action is the action to be performed, and is one of the constants listed above. Currently the different actions will either add or stop shaking the client. Versions: 1.16.210 – 1.26.60 */
		action?: "add" | "stop" | number | undefined;
	};
	/**
	 * PlayerFog is sent by the server to render the different fogs in the Stack. The types of fog are controlled
	 * by resource packs to change how they are rendered, and the ability to create custom fog.
	 */
	export type packet_player_fog = {
		/** Stack is a list of fog identifiers to be sent to the client. Examples of fog identifiers are "minecraft:fog_ocean" and "minecraft:fog_hell". */
		stack: string[];
	};
	/**
	 * CorrectPlayerMovePrediction is sent by the server if and only if StartGame.ServerAuthoritativeMovementMode
	 * is set to AuthoritativeMovementModeServerWithRewind. The packet is used to correct movement at a specific
	 * point in time.
	 */
	export type packet_correct_player_move_prediction = {
		/** Position is the position that the player is supposed to be at at the tick written in the field below. The client will change its current position based on movement after that tick starting from the Position. */
		position: vec3f;
		/** Delta is the change in position compared to what the client sent as its position at that specific tick. */
		delta: vec3f;
		/** OnGround specifies if the player was on the ground at the time of the tick below. */
		on_ground: boolean;
		/** Tick is the tick of the movement which was corrected by this packet. */
		tick: bigint | number;
		/** Versions: 1.20.80 – 1.26.60 */
		prediction_type?: "player" | "vehicle" | number | undefined;
		/** Versions: 1.20.80 – 1.21.93 */
		vehicle_rotation?: vec2f | {
			rotation: vec2f;
			angular_velocity?: number | undefined;
		} | undefined;
		/** Versions: 1.21.100 – 1.26.60 */
		rotation?: vec2f | undefined;
		/** Versions: 1.21.100 – 1.26.60 */
		angular_velocity?: number | undefined;
	};
	/**
	 * Versions: 1.16.201 – 1.21.50
	 */
	export type packet_item_component = {
		/** Versions: 1.16.201 – 1.21.50 */
		entries: ItemComponentList;
	};
	/**
	 * FilterText is sent by the both the client and the server. The client sends the packet to the server to
	 * allow the server to filter the text server-side. The server then responds with the same packet and the
	 * safer version of the text.
	 */
	export type packet_filter_text_packet = {
		/** Text is either the text from the client or the safer version of the text sent by the server. */
		text: string;
		/** FromServer indicates if the packet was sent by the server or not. */
		from_server: boolean;
	};
	/**
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type MetadataFlags1 = {
		/** Versions: 1.16.210 – 1.26.60 */
		_value?: bigint | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		onfire?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		sneaking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		riding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		sprinting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		action?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		invisible?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		tempted?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		inlove?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		saddled?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		powered?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		ignited?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		baby?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		converting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		critical?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		can_show_nametag?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		always_show_nametag?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		no_ai?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		silent?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		wallclimbing?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		can_climb?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		swimmer?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		can_fly?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		walker?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		resting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		sitting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		angry?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		interested?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		charged?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		tamed?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		orphaned?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		leashed?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		sheared?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		gliding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		elder?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		moving?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		breathing?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		chested?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		stackable?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		showbase?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		rearing?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		vibrating?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		idling?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		evoker_spell?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		charge_attack?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		wasd_controlled?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		can_power_jump?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		linger?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		has_collision?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		affected_by_gravity?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		fire_immune?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		dancing?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		enchanted?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		show_trident_rope?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		container_private?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		transforming?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		spin_attack?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		swimming?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		bribed?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		pregnant?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		laying_egg?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		rider_can_pick?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		transition_sitting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		eating?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		laying_down?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		can_dash?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type MetadataFlags2 = {
		/** Versions: 1.16.210 – 1.26.60 */
		_value?: bigint | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		sneezing?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		trusting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		rolling?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		scared?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		in_scaffolding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		over_scaffolding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		fall_through_scaffolding?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		blocking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		transition_blocking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		blocked_using_shield?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		blocked_using_damaged_shield?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		sleeping?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		wants_to_wake?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		trade_interest?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		door_breaker?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		breaking_obstruction?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		door_opener?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		illager_captain?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		stunned?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		roaring?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		delayed_attacking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		avoiding_mobs?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		avoiding_block?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		facing_target_to_range_attack?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		hidden_when_invisible?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		is_in_ui?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		stalking?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		emoting?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		celebrating?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		admiring?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		celebrating_special?: boolean | undefined;
		/** Versions: 1.17.0 – 1.26.60 */
		unknown95?: boolean | undefined;
		/** Versions: 1.17.0 – 1.26.60 */
		ram_attack?: boolean | undefined;
		/** Versions: 1.17.0 – 1.26.60 */
		playing_dead?: boolean | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		in_ascendable_block?: boolean | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		over_descendable_block?: boolean | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		croaking?: boolean | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		eat_mob?: boolean | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		jump_goal_jump?: boolean | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		emerging?: boolean | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		sniffing?: boolean | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		digging?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		sonic_boom?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		has_dash_cooldown?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		push_towards_closest_space?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		scenting?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		rising?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		feeling_happy?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		searching?: boolean | undefined;
		/** Versions: 1.20.10 – 1.26.60 */
		crawling?: boolean | undefined;
		/** Versions: 1.20.40 – 1.26.60 */
		timer_flag_1?: boolean | undefined;
		/** Versions: 1.20.40 – 1.26.60 */
		timer_flag_2?: boolean | undefined;
		/** Versions: 1.20.40 – 1.26.60 */
		timer_flag_3?: boolean | undefined;
		/** Versions: 1.20.80 – 1.26.60 */
		body_rotation_blocked?: boolean | undefined;
		/** Versions: 1.21.60 – 1.26.60 */
		render_when_invisible?: boolean | undefined;
		/** Versions: 1.21.70 – 1.26.60 */
		body_rotation_axis_aligned?: boolean | undefined;
		/** Versions: 1.21.70 – 1.26.60 */
		collidable?: boolean | undefined;
		/** Versions: 1.21.70 – 1.26.60 */
		wasd_air_controlled?: boolean | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		does_server_auth_only_dismount?: boolean | undefined;
		/** Versions: 1.21.90 – 1.26.60 */
		body_rotation_always_follows_head?: boolean | undefined;
		/** Versions: 1.21.111 – 1.26.60 */
		can_use_vertical_movement_action?: boolean | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		rotation_locked_to_vehicle?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		uses_legacy_friction?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		uses_uniform_air_drag?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		nameplate_depth_tested?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		not_pickable_from_inside?: boolean | undefined;
	};
	/**
	 * UseItemTransactionData represents an inventory transaction data object sent when the client uses an item on
	 * a block. Also used in PlayerAuthoritativeInput packet
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type TransactionUseItem = {
		/** ActionType is the type of the UseItem inventory transaction. It is one of the action types found above, and specifies the way the player interacted with the block. Versions: 1.16.210 – 1.26.60 */
		action_type: "click_block" | "click_air" | "break_block" | number | "attack";
		/** BlockPosition is the position of the block that was interacted with. This is only really a correct block position if ActionType is not UseItemActionClickAir. Versions: 1.16.210 – 1.26.60 */
		block_position: BlockCoordinates;
		/** BlockFace is the face of the block that was interacted with. When clicking the block, it is the face clicked. When breaking the block, it is the face that was last being hit until the block broke. Versions: 1.16.210 – 1.26.60 */
		face: number;
		/** HotBarSlot is the hot bar slot that the player was holding while clicking the block. It should be used to ensure that the hot bar slot and held item are correctly synchronised with the server. Versions: 1.16.210 – 1.26.60 */
		hotbar_slot: number;
		/** HeldItem is the item that was held to interact with the block. The server should check if this item is actually present in the HotBarSlot. Versions: 1.16.210 – 1.26.60 */
		held_item: Item | ItemV4;
		/** Position is the position of the player at the time of interaction. For clicking a block, this is the position at that time, whereas for breaking the block it is the position at the time of breaking. Versions: 1.16.210 – 1.26.60 */
		player_pos: vec3f;
		/** ClickedPosition is the position that was clicked relative to the block's base coordinate. It can be used to find out exactly where a player clicked the block. Versions: 1.16.210 – 1.26.60 */
		click_pos: vec3f;
		/** BlockRuntimeID is the runtime ID of the block that was clicked. It may be used by the server to verify that the player's world client-side is synchronised with the server's. Versions: 1.16.210 – 1.26.60 */
		block_runtime_id: number;
		/** TriggerType is the type of the trigger that caused the inventory transaction. It is one of the trigger types found in the constants above. If TriggerType is TriggerTypePlayerInput, the transaction is from the initial input of the player. If it is TriggerTypeSimulationTick, the transaction is from a simulation tick when the player is holding down the input. Versions: 1.21.20 – 1.26.60 */
		trigger_type?: "unknown" | "player_input" | "simulation_tick" | number | undefined;
		/** ClientPrediction is the client's prediction on the output of the transaction. Versions: 1.21.20 – 1.26.60 */
		client_prediction?: "failure" | "success" | number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		client_cooldown_state?: "off" | "on" | number | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		hand?: "main_hand" | "off_hand" | number | undefined;
	};
	/**
	 * Actions is a list of actions that took place, that form the inventory transaction together. Each of
	 * these actions hold one slot in which one item was changed to another. In general, the combination of
	 * all of these actions results in a balanced inventory transaction. This should be checked to ensure that
	 * no items are cheated into the inventory.
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type TransactionActions = {
		/** Versions: 1.16.210 */
		network_ids: boolean;
		/** Versions: 1.16.210 */
		actions: {
			source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
			inventory_id?: number | undefined;
			action?: number | undefined;
			flags?: number | undefined;
			slot: number;
			old_item: Item;
			new_item: Item;
			new_item_stack_id?: number | undefined;
		}[];
	} | {
		source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
		inventory_id?: WindowIDZigzag32 | undefined;
		action?: number | undefined;
		flags?: number | undefined;
		slot: number;
		old_item: Item;
		new_item: Item;
	}[] | {
		source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
		container_presence: boolean;
		window_id?: number | undefined;
		flag_presence: boolean;
		flags?: number | undefined;
		slot: number;
		old_item: ItemV4;
		new_item: ItemV4;
	}[] | {
		source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
		window_id?: number | undefined;
		flags?: number | undefined;
		slot: number;
		old_item: ItemV4;
		new_item: ItemV4;
	}[];
	/**
	 * The Minecraft bedrock inventory system was refactored, but not all inventory actions use the new packet.
	 * This data structure holds actions that have not been updated to the new system.
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type TransactionLegacy = {
		/** LegacyRequestID is an ID that is only non-zero at times when sent by the client. The server should always send 0 for this. When this field is not 0, the LegacySetItemSlots slice below will have values in it. LegacyRequestID ties in with the ItemStackResponse packet. If this field is non-0, the server should respond with an ItemStackResponse packet. Some inventory actions such as dropping an item out of the hotbar are still one using this packet, and the ItemStackResponse packet needs to tie in with it. Versions: 1.16.210 – 1.26.60 */
		legacy_request_id: number;
		/** Versions: 1.16.210 – 1.26.60 */
		legacy_transactions?: {
			container_id: number;
			changed_slots: {
				slot_id: number;
			}[];
		}[] | undefined;
	};
	/**
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type Action = "start_break" | "abort_break" | "stop_break" | "get_updated_block" | "drop_item" | "start_sleeping" | "stop_sleeping" | "respawn" | "jump" | "start_sprint" | "stop_sprint" | "start_sneak" | "stop_sneak" | "creative_player_destroy_block" | "dimension_change_ack" | "start_glide" | "stop_glide" | "build_denied" | "crack_break" | "change_skin" | "set_enchatnment_seed" | "swimming" | "stop_swimming" | "start_spin_attack" | "stop_spin_attack" | "interact_block" | "predict_break" | "continue_break" | number | "start_item_use_on" | "stop_item_use_on" | "handled_teleport" | "missed_swing" | "start_crawling" | "stop_crawling" | "start_flying" | "stop_flying" | "received_server_data" | "start_using_item";
	/**
	 * ItemStackRequest is sent by the client to change item stacks in an inventory. It is essentially a
	 * replacement of the InventoryTransaction packet added in 1.16 for inventory specific actions, such as moving
	 * items around or crafting. The InventoryTransaction packet is still used for actions such as placing blocks
	 * and interacting with entities.
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type ItemStackRequest = {
		/** RequestID is a unique ID for the request. This ID is used by the server to send a response for this specific request in the ItemStackResponse packet. Versions: 1.16.210 – 1.26.60 */
		request_id: number;
		/** Versions: 1.16.210 – 1.26.60 */
		actions: {
			/** As of 1.26.40 the action type is an unsigned varint, the 'place in container' and 'take out container' entries are gone, and the type is repeated as a byte right after it. */
			type_id: "take" | "place" | "swap" | "drop" | "destroy" | "consume" | "create" | "lab_table_combine" | "beacon_payment" | "mine_block" | "craft_recipe" | "craft_recipe_auto" | "craft_creative" | "optional" | "non_implemented" | "results_deprecated" | number | "craft_grindstone_request" | "craft_loom_request" | "place_in_container" | "take_out_container" | "craft_reserved";
			count?: number | undefined;
			source?: StackRequestSlotInfo | undefined;
			destination?: StackRequestSlotInfo | undefined;
			randomly?: boolean | undefined;
			result_slot_id?: number | undefined;
			primary_effect?: number | undefined;
			secondary_effect?: number | undefined;
			hotbar_slot?: number | undefined;
			predicted_durability?: number | undefined;
			network_id?: number | undefined;
			recipe_network_id?: number | undefined;
			times_crafted?: number | undefined;
			item_id?: number | undefined;
			filtered_string_index?: number | undefined;
			result_items?: Item[] | ItemLegacy[] | ItemStackRequestInstanceDescriptor[] | undefined;
			cost?: number | undefined;
			pattern?: string | undefined;
			ingredients?: RecipeIngredient[] | RecipeIngredient2[] | undefined;
			times_crafted_2?: number | undefined;
			/** The action type again, as a byte. */
			legacy_type_id?: number | undefined;
			reserved_id?: string | undefined;
		}[];
		/** Versions: 1.16.210 – 1.26.60 */
		custom_names: string[];
		/** Versions: 1.19.30 – 1.26.60 */
		cause?: "chat_public" | "chat_whisper" | "sign_text" | "anvil_text" | "book_and_quill_text" | "command_block_text" | "block_actor_data_text" | "join_event_text" | "leave_event_text" | "slash_command_chat" | "cartography_text" | number | "slash_command_non_chat" | "scoreboard_text" | "ticking_area_text" | "kick_command" | "title_command" | "summon_command" | undefined;
	};
	/**
	 * Used in inventory transactions.
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type ContainerSlotType = "anvil_input" | "anvil_material" | "anvil_result" | "smithing_table_input" | "smithing_table_material" | "smithing_table_result" | "armor" | "container" | "beacon_payment" | "brewing_input" | "brewing_result" | "brewing_fuel" | "hotbar_and_inventory" | "crafting_input" | "crafting_output" | "recipe_construction" | "recipe_nature" | "recipe_items" | "recipe_search" | "recipe_search_bar" | "recipe_equipment" | "enchanting_input" | "enchanting_lapis" | "furnace_fuel" | "furnace_ingredient" | "furnace_output" | "horse_equip" | "hotbar" | "inventory" | "shulker" | "trade_ingredient1" | "trade_ingredient2" | "trade_result" | "offhand" | "compcreate_input" | "compcreate_output" | "elemconstruct_output" | "matreduce_input" | "matreduce_output" | "labtable_input" | "loom_input" | "loom_dye" | "loom_material" | "loom_result" | "blast_furnace_ingredient" | "smoker_ingredient" | "trade2_ingredient1" | "trade2_ingredient2" | "trade2_result" | "grindstone_input" | "grindstone_additional" | "grindstone_result" | "stonecutter_input" | "stonecutter_result" | "cartography_input" | "cartography_additional" | "cartography_result" | "barrel" | "cursor" | "creative_output" | number | "recipe_book" | "smithing_table_template" | "crafter" | "dynamic" | "registry" | "recipe_food" | "recipe_blocks" | "recipe_furnace_items" | "reserved_container_a" | "reserved_container_b" | "reserved_container_c" | "reserved_container_d";
	/**
	 * Versions: 1.16.210 – 1.26.60
	 */
	export type UpdateBlockFlags = {
		/** Versions: 1.16.210 – 1.26.60 */
		_value?: number | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		neighbors?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		network?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		no_graphic?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		unused?: boolean | undefined;
		/** Versions: 1.16.210 – 1.26.60 */
		priority?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.210 – 1.26.10
	 */
	export type packet_debug_renderer = {
		/** Versions: 1.16.210 – 1.26.10 */
		type: "clear" | "add_cube" | number | string;
		/** Versions: 1.16.210 – 1.21.124 */
		text?: string | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		position?: vec3f | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		red?: number | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		green?: number | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		blue?: number | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		alpha?: number | undefined;
		/** Versions: 1.16.210 – 1.21.124 */
		duration?: Int64Write | undefined;
		/** Versions: 1.21.130 – 1.26.10 */
		has_data?: boolean | undefined;
		/** Versions: 1.21.130 – 1.26.10 */
		data?: DebugMarkerData | undefined;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ShortArray = Buffer;
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ShortString = string;
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type BlockProperties = {
		name: string;
		state: NBT;
	}[];
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ItemExtraDataWithBlockingTick = {
		/** Versions: 1.16.220 – 1.26.60 */
		has_nbt: "false" | false | "true" | true | number;
		/** Versions: 1.16.220 – 1.26.60 */
		nbt?: {
			version: number;
			nbt: NBT;
		} | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		can_place_on: ShortString[];
		/** Versions: 1.16.220 – 1.26.60 */
		can_destroy: ShortString[];
		/** Versions: 1.16.220 – 1.26.60 */
		blocking_tick: Int64Write;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ItemExtraDataWithoutBlockingTick = {
		/** Versions: 1.16.220 – 1.26.60 */
		has_nbt: "false" | false | "true" | true | number;
		/** Versions: 1.16.220 – 1.26.60 */
		nbt?: {
			version: number;
			nbt: NBT;
		} | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		can_place_on: ShortString[];
		/** Versions: 1.16.220 – 1.26.60 */
		can_destroy: ShortString[];
	};
	/**
	 * Same as below but without a "networkStackID" boolean
	 * As of 1.26.40 an air item (network_id 0) no longer short-circuits: every field is always written, only
	 * the extra data blob ends up empty.
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type ItemLegacy = {
		/** Versions: 1.16.220 – 1.26.60 */
		network_id: number;
		/** Versions: 1.16.220 – 1.26.60 */
		count?: number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		metadata?: number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		block_runtime_id?: number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		extra?: ItemExtraDataWithBlockingTick | ItemExtraDataWithoutBlockingTick | undefined;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type EnchantOption = {
		/** Versions: 1.16.220 – 1.26.60 */
		cost: number;
		/** Versions: 1.16.220 – 1.26.60 */
		slot_flags: number;
		/** Versions: 1.16.220 – 1.26.60 */
		equip_enchants: Enchant[];
		/** Versions: 1.16.220 – 1.26.60 */
		held_enchants: Enchant[];
		/** Versions: 1.16.220 – 1.26.60 */
		self_enchants: Enchant[];
		/** Versions: 1.16.220 – 1.26.60 */
		name: string;
		/** Versions: 1.16.220 – 1.26.60 */
		option_id: number;
	};
	/**
	 * MapTrackedObject is an object on a map that is 'tracked' by the client, such as an entity or a block. This
	 * object may move, which is handled client-side.
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type TrackedObject = {
		/** Type is the type of the tracked object. It is either MapObjectTypeEntity or MapObjectTypeBlock. Versions: 1.16.220 – 1.26.60 */
		type: "entity" | "block" | number;
		/** Versions: 1.16.220 – 1.26.60 */
		entity_unique_id?: bigint | number | undefined;
		/** Versions: 1.16.220 – 1.26.60 */
		block_position?: BlockCoordinates | undefined;
	};
	/**
	 * MapDecoration is a fixed decoration on a map: Its position or other properties do not change automatically
	 * client-side.
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type MapDecoration = {
		/** Versions: 1.16.220 – 1.26.60 */
		type: "marker_white" | "marker_green" | "marker_red" | "marker_blue" | "cross_white" | "triangle_red" | "square_white" | "marker_sign" | "marker_pink" | "marker_orange" | "marker_yellow" | "marker_teal" | "triangle_green" | "small_square_white" | "mansion" | "monument" | "no_draw" | "village_desert" | "village_plains" | "village_savanna" | "village_snowy" | "village_taiga" | "jungle_temple" | "witch_hut" | number | "witch_hut =>";
		/** Rotation is the rotation of the map decoration. It is byte due to the 16 fixed directions that the map decoration may face. Versions: 1.16.220 – 1.26.60 */
		rotation: number;
		/** X is the offset on the X axis in pixels of the decoration. Versions: 1.16.220 – 1.26.60 */
		x: number;
		/** Y is the offset on the Y axis in pixels of the decoration. Versions: 1.16.220 – 1.26.60 */
		y: number;
		/** Label is the name of the map decoration. This name may be of any value. Versions: 1.16.220 – 1.26.60 */
		label: string;
		/** Colour is the colour of the map decoration. Some map decoration types have a specific colour set automatically, whereas others may be changed. As of 1.26.40 this is a little endian int. Versions: 1.16.220 – 1.26.60 */
		color_abgr: number;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type StructureBlockSettings = {
		/** PaletteName is the name of the palette used in the structure. Currently, it seems that this field is always 'default'. Versions: 1.16.220 – 1.26.60 */
		palette_name: string;
		/** IgnoreEntities specifies if the structure should ignore entities or include them. If set to false, entities will also show up in the exported structure. Versions: 1.16.220 – 1.26.60 */
		ignore_entities: boolean;
		/** IgnoreBlocks specifies if the structure should ignore blocks or include them. If set to false, blocks will show up in the exported structure. Versions: 1.16.220 – 1.26.60 */
		ignore_blocks: boolean;
		/** Size is the size of the area that is about to be exported. The area exported will start at the Position + Offset, and will extend as far as Size specifies. Versions: 1.16.220 – 1.26.60 */
		size: BlockCoordinates;
		/** Offset is the offset position that was set in the structure block. The area exported is offset by this position. **TODO**: This will be renamed to offset soon Versions: 1.16.220 – 1.26.60 */
		structure_offset: BlockCoordinates;
		/** LastEditingPlayerUniqueID is the unique ID of the player that last edited the structure block that these settings concern. Versions: 1.16.220 – 1.26.60 */
		last_editing_player_unique_id: bigint | number;
		/** Rotation is the rotation that the structure block should obtain. See the constants above for available options. Versions: 1.16.220 – 1.26.60 */
		rotation: number | "none" | "90_deg" | "180_deg" | "270_deg";
		/** Mirror specifies the way the structure should be mirrored. It is either no mirror at all, mirror on the x/z axis or both. Versions: 1.16.220 – 1.26.60 */
		mirror: number | "none" | "x_axis" | "z_axis" | "both_axes";
		/** Integrity is usually 1, but may be set to a number between 0 and 1 to omit blocks randomly, using the Seed that follows. Versions: 1.16.220 – 1.26.60 */
		integrity: number;
		/** Seed is the seed used to omit blocks if Integrity is not equal to one. If the Seed is 0, a random seed is selected to omit blocks. Versions: 1.16.220 – 1.26.60 */
		seed: number;
		/** Pivot is the pivot around which the structure may be rotated. Versions: 1.16.220 – 1.26.60 */
		pivot: vec3f;
		/** Versions: 1.17.0 – 1.26.60 */
		animation_mode?: "none" | "layers" | "blocks" | number | undefined;
		/** How long the duration for this animation is Versions: 1.17.0 – 1.26.60 */
		animation_duration?: number | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		non_ticking_players_and_ticking_areas?: boolean | undefined;
	};
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type WindowIDZigzag32 = "inventory" | "first" | "last" | "offhand" | "armor" | "creative" | "hotbar" | "fixed_inventory" | "ui" | "drop_contents" | "beacon" | "trading_output" | "trading_use_inputs" | "trading_input_2" | "trading_input_1" | "enchant_output" | "enchant_material" | "enchant_input" | "anvil_output" | "anvil_result" | "anvil_material" | "container_input" | "crafting_use_ingredient" | "crafting_result" | "crafting_remove_ingredient" | "crafting_add_ingredient" | "none" | number;
	/**
	 * Versions: 1.16.220 – 1.26.60
	 */
	export type SoundType = "ItemUseOn" | "Hit" | "Step" | "Fly" | "Jump" | "Break" | "Place" | "HeavyStep" | "Gallop" | "Fall" | "Ambient" | "AmbientBaby" | "AmbientInWater" | "Breathe" | "Death" | "DeathInWater" | "DeathToZombie" | "Hurt" | "HurtInWater" | "Mad" | "Boost" | "Bow" | "SquishBig" | "SquishSmall" | "FallBig" | "FallSmall" | "Splash" | "Fizz" | "Flap" | "Swim" | "Drink" | "Eat" | "Takeoff" | "Shake" | "Plop" | "Land" | "Saddle" | "Armor" | "MobArmorStandPlace" | "AddChest" | "Throw" | "Attack" | "AttackNoDamage" | "AttackStrong" | "Warn" | "Shear" | "Milk" | "Thunder" | "Explode" | "Fire" | "Ignite" | "Fuse" | "Stare" | "Spawn" | "Shoot" | "BreakBlock" | "Launch" | "Blast" | "LargeBlast" | "Twinkle" | "Remedy" | "Infect" | "LevelUp" | "BowHit" | "BulletHit" | "ExtinguishFire" | "ItemFizz" | "ChestOpen" | "ChestClosed" | "ShulkerBoxOpen" | "ShulkerBoxClosed" | "EnderChestOpen" | "EnderChestClosed" | "PowerOn" | "PowerOff" | "Attach" | "Detach" | "Deny" | "Tripod" | "Pop" | "DropSlot" | "Note" | "Thorns" | "PistonIn" | "PistonOut" | "Portal" | "Water" | "LavaPop" | "Lava" | "Burp" | "BucketFillWater" | "BucketFillLava" | "BucketEmptyWater" | "BucketEmptyLava" | "ArmorEquipChain" | "ArmorEquipDiamond" | "ArmorEquipGeneric" | "ArmorEquipGold" | "ArmorEquipIron" | "ArmorEquipLeather" | "ArmorEquipElytra" | "Record13" | "RecordCat" | "RecordBlocks" | "RecordChirp" | "RecordFar" | "RecordMall" | "RecordMellohi" | "RecordStal" | "RecordStrad" | "RecordWard" | "Record11" | "RecordWait" | "unknown1" | "Flop" | "ElderGuardianCurse" | "MobWarning" | "MobWarningBaby" | "Teleport" | "ShulkerOpen" | "ShulkerClose" | "Haggle" | "HaggleYes" | "HaggleNo" | "HaggleIdle" | "ChorusGrow" | "ChorusDeath" | "Glass" | "PotionBrewed" | "CastSpell" | "PrepareAttack" | "PrepareSummon" | "PrepareWololo" | "Fang" | "Charge" | "CameraTakePicture" | "LeashKnotPlace" | "LeashKnotBreak" | "Growl" | "Whine" | "Pant" | "Purr" | "Purreow" | "DeathMinVolume" | "DeathMidVolume" | "unknown2" | "ImitateCaveSpider" | "ImitateCreeper" | "ImitateElderGuardian" | "ImitateEnderDragon" | "ImitateEnderman" | "unknown3" | "ImitateEvocationIllager" | "ImitateGhast" | "ImitateHusk" | "ImitateIllusionIllager" | "ImitateMagmaCube" | "ImitatePolarBear" | "ImitateShulker" | "ImitateSilverfish" | "ImitateSkeleton" | "ImitateSlime" | "ImitateSpider" | "ImitateStray" | "ImitateVex" | "ImitateVindicationIllager" | "ImitateWitch" | "ImitateWither" | "ImitateWitherSkeleton" | "ImitateWolf" | "ImitateZombie" | "ImitateZombiePigman" | "ImitateZombieVillager" | "BlockEndPortalFrameFill" | "BlockEndPortalSpawn" | "RandomAnvilUse" | "BottleDragonBreath" | "PortalTravel" | "ItemTridentHit" | "ItemTridentReturn" | "ItemTridentRiptide1" | "ItemTridentRiptide2" | "ItemTridentRiptide3" | "ItemTridentThrow" | "ItemTridentThunder" | "ItemTridentHitGround" | "Default" | "BlockFletchingTableUse" | "ElemConstructOpen" | "IceBombHit" | "BalloonPop" | "LtReactionIceBomb" | "LtReactionBleach" | "LtReactionEPaste" | "LtReactionEPaste2" | "LtReactionFertilizer" | "LtReactionFireball" | "LtReactionMgsalt" | "LtReactionMiscfire" | "LtReactionFire" | "LtReactionMiscexplosion" | "LtReactionMiscmystical" | "LtReactionMiscmystical2" | "LtReactionProduct" | "SparklerUse" | "GlowstickUse" | "SparklerActive" | "ConvertToDrowned" | "BucketFillFish" | "BucketEmptyFish" | "BubbleUp" | "BubbleDown" | "BubblePop" | "BubbleUpInside" | "BubbleDownInside" | "HurtBaby" | "DeathBaby" | "StepBaby" | "BabySpawn" | "Born" | "BlockTurtleEggBreak" | "BlockTurtleEggCrack" | "BlockTurtleEggHatch" | "TurtleLayEgg" | "BlockTurtleEggAttack" | "BeaconActivate" | "BeaconAmbient" | "BeaconDeactivate" | "BeaconPower" | "ConduitActivate" | "ConduitAmbient" | "ConduitAttack" | "ConduitDeactivate" | "ConduitShort" | "Swoop" | "BlockBambooSaplingPlace" | "PreSneeze" | "Sneeze" | "AmbientTame" | "Scared" | "BlockScaffoldingClimb" | "CrossbowLoadingStart" | "CrossbowLoadingMiddle" | "CrossbowLoadingEnd" | "CrossbowShoot" | "CrossbowQuickChargeStart" | "CrossbowQuickChargeMiddle" | "CrossbowQuickChargeEnd" | "AmbientAggressive" | "AmbientWorried" | "CantBreed" | "ItemShieldBlock" | "ItemBookPut" | "BlockGrindstoneUse" | "BlockBellHit" | "BlockCampfireCrackle" | "Roar" | "Stun" | "BlockSweetBerryBushHurt" | "BlockSweetBerryBushPick" | "UICartographyTableTakeResult" | "UIStoneCutterTakeResult" | "BlockComposterEmpty" | "BlockComposterFill" | "BlockComposterFillSuccess" | "BlockComposterReady" | "BlockBarrelOpen" | "BlockBarrelClose" | "RaidHorn" | "BlockLoomUse" | "AmbientRaid" | "UICartographyTableUse" | "UIStoneCutterUse" | "UILoomUse" | "SmokerUse" | "BlastFurnaceUse" | "SmithingTableUse" | "Screech" | "Sleep" | "FurnaceUse" | "MooshroomConvert" | "MilkSuspiciously" | "Celebrate" | "JumpPrevent" | "AmbientPollinate" | "BeeHiveDrip" | "BeeHiveEnter" | "BeeHiveExit" | "BeeHiveWork" | "BeeHiveShear" | "HoneyBottleDrink" | "AmbientCave" | "Retreat" | "ConvertToZombified" | "Admire" | "StepLava" | "Tempt" | "Panic" | "Angry" | "AmbientWarpedForest" | "AmbientSoulsandValley" | "AmbientNetherWastes" | "AmbientBasaltDeltas" | "AmbientCrimsonForest" | "RespawnAnchorCharge" | "RespawnAnchorDeplete" | "RespawnAnchorSetSpawn" | "RespawnAnchorAmbient" | "SoulEscapeQuiet" | "SoulEscapeLoud" | "RecordPigstep" | "LinkCompassToLodestone" | "BlockSmithingTableUse" | "EquipNetherite" | "AmbientLoopWarpedForest" | "AmbientLoopSoulsandValley" | "AmbientLoopNetherWastes" | "AmbientLoopBasaltDeltas" | "AmbientLoopCrimsonForest" | "AmbientAdditionWarpedForest" | "AmbientAdditionSoulsandValley" | "AmbientAdditionNetherWastes" | "AmbientAdditionBasaltDeltas" | "AmbientAdditionCrimsonForest" | "SculkSensorPowerOn" | "SculkSensorPowerOff" | "BucketFillPowderSnow" | "BucketEmptyPowderSnow" | "PointedDripstoneCauldronDripWater" | "PointedDripstoneCauldronDripLava" | "PointedDripstoneDripWater" | "PointedDripstoneDripLava" | "CaveVinesPickBerries" | "BigDripleafTiltDown" | "BigDripleafTiltUp" | "Undefined" | number | "unknown335" | "unknown336" | "unknown337" | "unknown338" | "copper_wax_on" | "copper_wax_off" | "scrape" | "player_hurt_drown" | "player_hurt_on_fire" | "player_hurt_freeze" | "use_spyglass" | "stop_using_spyglass" | "amethyst_block_chime" | "ambient_screamer" | "hurt_screamer" | "death_screamer" | "milk_screamer" | "jump_to_block" | "pre_ram" | "pre_ram_screamer" | "ram_impact" | "ram_impact_screamer" | "squid_ink_squirt" | "glow_squid_ink_squirt" | "convert_to_stray" | "extinguish_candle" | "ambient_candle" | "StopRecord" | "GuardianCurse" | "PrepareAttackSpell" | "AmbientGrowl" | "AmbientWhine" | "AmbientPant" | "AmbientPurr" | "AmbientPurreow" | "ImitateBlaze" | "ImitateEndermite" | "EnderEyePlaced" | "EndPortalCreated" | "AnvilUse" | "TridentHit" | "TridentReturn" | "TridentRiptide1" | "TridentRiptide2" | "TridentRiptide3" | "TridentThrow" | "TridentThunder" | "TridentHitGround" | "FletchingTableUse" | "LtReactionElephantToothpaste" | "LtReactionElephantToothpaste2" | "LtReactionGlowStick" | "LtReactionGlowStick2" | "LtReactionLuminol" | "LtReactionSalt" | "LtReactionMagnesiumSalt" | "LtReactionMiscFire" | "LtReactionMiscExplosion" | "LtReactionMiscMystical" | "LtReactionMiscMystical2" | "GlowStickUse" | "BubbleColumnUpwards" | "BubbleColumnDownwards" | "SpawnBaby" | "TurtleEggBreak" | "TurtleEggCrack" | "TurtleEggHatched" | "LayEgg" | "TurtleEggAttacked" | "BambooSaplingPlace" | "ScaffoldingClimb" | "ShieldBlock" | "LecternBookPlace" | "GrindstoneUse" | "Bell" | "CampfireCrackle" | "SweetBerryBushHurt" | "SweetBerryBushPick" | "CartographyTableUse" | "StonecutterUse" | "ComposterEmpty" | "ComposterFill" | "ComposterFillLayer" | "ComposterReady" | "BarrelOpen" | "BarrelClose" | "LoomUse" | "AmbientInRaid" | "UIStonecutterUse" | "BeehiveDrip" | "BeehiveEnter" | "BeehiveExit" | "BeehiveWork" | "BeehiveShear" | "HoneybottleDrink" | "AmbientMoodWarpedForest" | "AmbientMoodSoulsandValley" | "AmbientMoodNetherWastes" | "AmbientMoodBasaltDeltas" | "AmbientMoodCrimsonForest" | "UseSmithingTable" | "CopperWaxOn" | "CopperWaxOff" | "Scrape" | "PlayerHurtDrown" | "PlayerHurtOnFire" | "PlayerHurtFreeze" | "UseSpyglass" | "StopUsingSpyglass" | "AmethystBlockChime" | "AmbientScreamer" | "HurtScreamer" | "DeathScreamer" | "MilkScreamer" | "JumpToBlock" | "PreRam" | "PreRamScreamer" | "RamImpact" | "RamImpactScreamer" | "SquidInkSquirt" | "GlowSquidInkSquirt" | "ConvertToStray" | "CakeAddCandle" | "ExtinguishCandle" | "AmbientCandle" | "BlockClick" | "BlockClickFail" | "SculkCatalystBloom" | "SculkShriekerShriek" | "WardenNearbyClose" | "WardenNearbyCloser" | "WardenNearbyClosest" | "WardenSlightlyAngry" | "RecordOtherside" | "Tongue" | "CrackIronGolem" | "RepairIronGolem" | "UicartographyTableUse" | "UistonecutterUse" | "UiloomUse" | "Listening" | "Heartbeat" | "HornBreak" | "SculkPlace" | "SculkSpread" | "SculkCharge" | "SculkSensorPlace" | "SculkShriekerPlace" | "goat_call_0" | "goat_call_1" | "goat_call_2" | "goat_call_3" | "goat_call_4" | "goat_call_5" | "goat_call_6" | "goat_call_7" | "goat_call_8" | "goat_call_9" | "goat_harmony_0" | "goat_harmony_1" | "goat_harmony_2" | "goat_harmony_3" | "goat_harmony_4" | "goat_harmony_5" | "goat_harmony_6" | "goat_harmony_7" | "goat_harmony_8" | "goat_harmony_9" | "goat_melody_0" | "goat_melody_1" | "goat_melody_2" | "goat_melody_3" | "goat_melody_4" | "goat_melody_5" | "goat_melody_6" | "goat_melody_7" | "goat_melody_8" | "goat_melody_9" | "goat_bass_0" | "goat_bass_1" | "goat_bass_2" | "goat_bass_3" | "goat_bass_4" | "goat_bass_5" | "goat_bass_6" | "goat_bass_7" | "goat_bass_8" | "goat_bass_9" | "_" | "ImitateWarden" | "ListeningAngry" | "ItemGiven" | "ItemTaken" | "Disappeared" | "Reappeared" | "FrogspawnHatched" | "LaySpawn" | "FrogspawnBreak" | "SonicBoom" | "SonicCharge" | "SoundeventItemThrown" | "Record5" | "ConvertToFrog" | "DrinkMilk" | "RecordPlaying" | "EnchantingTableUse" | "BundleDropContents" | "BundleInsert" | "BundleRemoveOne" | "StepSand" | "DashReady" | "PressurePlateClickOff" | "PressurePlateClickOn" | "ButtonClickOff" | "ButtonClickOn" | "DoorOpen" | "DoorClose" | "TrapdoorOpen" | "TrapdoorClose" | "FenceGateOpen" | "FenceGateClose" | "Insert" | "Pickup" | "InsertEnchanted" | "PickupEnchanted" | "Brush" | "BrushCompleted" | "ShatterDecoratedPot" | "BreakDecoratedPot" | "SnifferEggCrack" | "SnifferEggHatched" | "WaxedSignInteractFail" | "RecordRelic" | "Bump" | "PumpkinCarve" | "ConvertHuskToZombie" | "PigDeath" | "HoglinZombified" | "AmbientUnderwaterEnter" | "AmbientUnderwaterExit" | "bottle_fill" | "bottle_empty" | "crafter_craft" | "crafter_fail" | "block_decorated_pot_insert" | "block_decorated_pot_insert_fail" | "crafter_disable_slot" | "block_copper_bulb_turn_on" | "block_copper_bulb_turn_off" | "trial_spawner_open_shutter" | "trial_spawner_eject_item" | "trial_spawner_detect_player" | "trial_spawner_spawn_mob" | "trial_spawner_close_shutter" | "trial_spawner_ambient" | "ambient_in_air" | "breeze_wind_charge_burst" | "imitate_breeze" | "mob_armadillo_brush" | "mob_armadillo_scute_drop" | "armor_equip_wolf" | "armor_unequip_wolf" | "reflect" | "vault_open_shutter" | "vault_close_shutter" | "vault_eject_item" | "vault_insert_item" | "vault_insert_item_fail" | "vault_ambient" | "vault_activate" | "vault_deactivate" | "hurt_reduced" | "wind_charge_burst" | "armor_crack_wolf" | "armor_break_wolf" | "armor_repair_wolf" | "mace_smash_air" | "mace_smash_ground" | "trail_spawner_charge_activate" | "trail_spawner_ambient_ominous" | "ominous_item_spawner_spawn_item" | "ominous_bottle_end_use" | "mace_smash_heavy_ground" | "ominous_item_spawner_spawn_item_begin" | "apply_effect_bad_omen" | "apply_effect_raid_omen" | "apply_effect_trial_omen" | "ominous_item_spawner_about_to_spawn_item" | "record_creator" | "record_creator_music_box" | "record_precipice" | "imitate_drowned" | "bundle_insert_failed" | "imitate_creaking" | "sponge_absorb" | "block_creaking_heart_trail" | "creaking_heart_spawn" | "activate" | "deactivate" | "freeze" | "unfreeze" | "open" | "open_long" | "close" | "close_long" | "imitate_phantom" | "imitate_zoglin" | "imitate_guardian" | "imitate_ravager" | "imitate_pillager" | "place_in_water" | "state_change" | "imitate_happy_ghast" | "unique_generic" | "record_tears" | "the_end_light_flash" | "lead_leash" | "lead_unleash" | "lead_break" | "unsaddle" | "equip_copper" | "ArmorStandPlace" | "Unfect" | "GoatCall0" | "GoatCall1" | "GoatCall2" | "GoatCall3" | "GoatCall4" | "GoatCall5" | "GoatCall6" | "GoatCall7" | "GoatCall8" | "GoatCall9" | "GoatHarmony0" | "GoatHarmony1" | "GoatHarmony2" | "GoatHarmony3" | "GoatHarmony4" | "GoatHarmony5" | "GoatHarmony6" | "GoatHarmony7" | "GoatHarmony8" | "GoatHarmony9" | "GoatMelody0" | "GoatMelody1" | "GoatMelody2" | "GoatMelody3" | "GoatMelody4" | "GoatMelody5" | "GoatMelody6" | "GoatMelody7" | "GoatMelody8" | "GoatMelody9" | "GoatBass0" | "GoatBass1" | "GoatBass2" | "GoatBass3" | "GoatBass4" | "GoatBass5" | "GoatBass6" | "GoatBass7" | "GoatBass8" | "GoatBass9" | "BottleFill" | "BottleEmpty" | "CrafterCraft" | "CrafterFail" | "DecoratedPotInsert" | "DecoratedPotInsertFail" | "CrafterDisableSlot" | "TrialSpawnerOpenShutter" | "TrialSpawnerEjectItem" | "TrialSpawnerDetectPlayer" | "TrialSpawnerSpawnMob" | "TrialSpawnerCloseShutter" | "TrialSpawnerAmbient" | "CopperBulbTurnOn" | "CopperBulbTurnOff" | "AmbientInAir" | "BreezeWindChargeBurst" | "ImitateBreeze" | "ArmadilloBrush" | "ArmadilloScuteDrop" | "EquipWolf" | "UnequipWolf" | "Reflect" | "VaultOpenShutter" | "VaultCloseShutter" | "VaultEjectItem" | "VaultInsertItem" | "VaultInsertItemFail" | "VaultAmbient" | "VaultActivate" | "VaultDeactive" | "HurtReduced" | "WindChargeBurst" | "ImitateBogged" | "WolfArmourCrack" | "WolfArmourBreak" | "WolfArmourRepair" | "MaceSmashAir" | "MaceSmashGround" | "TrialSpawnerChargeActivate" | "TrialSpawnerAmbientOminous" | "OminiousItemSpawnerSpawnItem" | "OminousBottleEndUse" | "MaceHeavySmashGround" | "OminousItemSpawnerSpawnItemBegin" | "ApplyEffectBadOmen" | "ApplyEffectRaidOmen" | "ApplyEffectTrialOmen" | "OminousItemSpawnerAboutToSpawnItem" | "RecordCreator" | "RecordCreatorMusicBox" | "RecordPrecipice" | "VaultRejectRewardedPlayer" | "ImitateDrowned" | "ImitateCreaking" | "BundleInsertFailed" | "SpongeAbsorb" | "BlockCreakingHeartTrail" | "CreakingHeartSpawn" | "Activate" | "Deactivate" | "Freeze" | "Unfreeze" | "Open" | "OpenLong" | "Close" | "CloseLong" | "ImitatePhantom" | "ImitateZoglin" | "ImitateGuardian" | "ImitateRavager" | "ImitatePillager" | "PlaceInWater" | "StateChange" | "ImitateHappyGhast" | "UniqueGeneric" | "RecordTears" | "TheEndLightFlash" | "LeadLeash" | "LeadUnleash" | "LeadBreak" | "Unsaddle" | "EquipCopper" | "RecordLavaChicken" | "PlaceItem" | "SingleItemSwap" | "MultiItemSwap" | "ItemEnchantLunge1" | "ItemEnchantLunge2" | "ItemEnchantLunge3" | "AttackCritical" | "ItemSpearAttackHit" | "ItemSpearAttackMiss" | "ItemWoodenSpearAttackHit" | "ItemWoodenSpearAttackMiss" | "ImitateParched" | "ImitateCamelHusk" | "ItemSpearUse" | "ItemWoodenSpearUse" | "SaddleInWater" | "ItemStoneSpearAttackHit" | "ItemIronSpearAttackHit" | "ItemCopperSpearAttackHit" | "ItemGoldenSpearAttackHit" | "ItemDiamondSpearAttackHit" | "ItemNetheriteSpearAttackHit" | "ItemStoneSpearAttackMiss" | "ItemIronSpearAttackMiss" | "ItemCopperSpearAttackMiss" | "ItemGoldenSpearAttackMiss" | "ItemDiamondSpearAttackMiss" | "ItemNetheriteSpearAttackMiss" | "ItemStoneSpearUse" | "ItemIronSpearUse" | "ItemCopperSpearUse" | "ItemGoldenSpearUse" | "ItemDiamondSpearUse" | "ItemNetheriteSpearUse" | "PauseGrowth" | "ResetGrowth" | "PushedByPlayer" | "Bounce" | "SlimeLanding" | "AbsorbBlock" | "EjectBlock" | "GeyserEruptionStart" | "GeyserEruptionActive" | "RecordBounce" | "BucketFillLandAnimal" | "BucketEmptyLandAnimal" | "GeyserContinuousEruptionStart" | "GeyserContinuousEruptionActive" | "Mount" | "Dismount" | "StrawBedBreakLeave";
	/**
	 * Versions: 1.16.220 – 1.26.30
	 */
	export type UpdateMapFlags = {
		/** Versions: 1.16.220 – 1.26.30 */
		_value?: number | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		void?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		texture?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		decoration?: boolean | undefined;
		/** Versions: 1.16.220 – 1.26.30 */
		initialisation?: boolean | undefined;
	};
	/**
	 * Sent by the server to synchronize/update entity properties as NBT, an alternative to Set Entity Data.
	 * Versions: 1.17.0 – 1.26.60
	 */
	export type packet_sync_entity_property = {
		/** Versions: 1.17.0 – 1.26.60 */
		nbt: NBT;
	};
	/**
	 * AddVolumeEntity sends a volume entity's definition and components from server to client.
	 * Versions: 1.17.0 – 1.26.60
	 */
	export type packet_add_volume_entity = {
		/** Versions: 1.17.0 – 1.18.0 */
		entity_id?: bigint | number | undefined;
		/** EntityMetadata is a map of entity metadata, which includes flags and data properties that alter in particular the way the entity looks. Versions: 1.17.0 – 1.26.60 */
		nbt: NBT;
		/** Versions: 1.17.30 – 1.26.60 */
		engine_version?: string | undefined;
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.18.11 – 1.26.60 */
		runtime_id?: bigint | number | undefined;
		/** Versions: 1.18.11 */
		json_identifier?: string | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		instance_name?: string | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		encoding_identifier?: string | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		bounds?: {
			min: BlockCoordinates;
			max: BlockCoordinates;
		} | undefined;
		/** Versions: 1.18.30 – 1.26.60 */
		dimension?: number | undefined;
	};
	/**
	 * RemoveVolumeEntity indicates a volume entity to be removed from server to client.
	 * Versions: 1.17.0 – 1.26.60
	 */
	export type packet_remove_volume_entity = {
		/** The Runtime Entity ID Versions: 1.17.0 – 1.26.60 */
		entity_id: bigint | number;
	};
	/**
	 * SimulationType is an in-progress packet. We currently do not know the use case.
	 * Versions: 1.17.10 – 1.26.60
	 */
	export type packet_simulation_type = {
		/** SimulationType is the simulation type selected Versions: 1.17.10 – 1.26.60 */
		type: "game" | "editor" | "test" | "invalid" | number;
	};
	/**
	 * NPCDialogue is a packet that allows the client to display dialog boxes for interacting with NPCs.
	 * Versions: 1.17.10 – 1.26.60
	 */
	export type packet_npc_dialogue = {
		/** ActorUniqueID is the ID of the NPC being requested. Versions: 1.17.10 – 1.26.60 */
		entity_id: Int64Write;
		/** ActionType is the type of action for the packet. Versions: 1.17.10 – 1.26.60 */
		action_type: "open" | "close" | number;
		/** Dialogue is the text that the client should see. Versions: 1.17.10 – 1.26.60 */
		dialogue: string;
		/** SceneName is the scene the data was pulled from for the client. Versions: 1.17.10 – 1.26.60 */
		screen_name: string;
		/** NPCName is the name of the NPC to be displayed to the client. Versions: 1.17.10 – 1.26.60 */
		npc_name: string;
		/** ActionJSON is the JSON string of the buttons/actions the server can perform. Versions: 1.17.10 – 1.26.60 */
		action_json: string;
	};
	/**
	 * EducationSharedResourceURI is an education edition feature that is used for transmitting
	 * education resource settings to clients. It contains a button name and a link URL.
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type EducationSharedResourceURI = {
		/** ButtonName is the button name of the resource URI. Versions: 1.17.30 – 1.26.60 */
		button_name: string;
		/** LinkURI is the link URI for the resource URI. Versions: 1.17.30 – 1.26.60 */
		link_uri: string;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type EducationExternalLinkSettings = {
		/** URL is the external link URL. Versions: 1.17.30 – 1.26.60 */
		url: string;
		/** DisplayName is the display name in game. Versions: 1.17.30 – 1.26.60 */
		display_name: string;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type BlockUpdate = {
		/** Versions: 1.17.30 – 1.26.60 */
		position: BlockCoordinates;
		/** Versions: 1.17.30 – 1.26.60 */
		runtime_id: number;
		/** Versions: 1.17.30 – 1.26.60 */
		flags: number;
		/** EntityUniqueID is the unique ID of the falling block entity that the block transitions to or that the entity transitions from. Note that for both possible values for TransitionType, the EntityUniqueID should point to the falling block entity involved. Versions: 1.17.30 – 1.26.60 */
		entity_unique_id: bigint | number;
		/** TransitionType is the type of the transition that happened. It is either BlockToEntityTransition, when a block placed becomes a falling entity, or EntityToBlockTransition, when a falling entity hits the ground and becomes a solid block again. Versions: 1.17.30 – 1.26.60 */
		transition_type: "entity" | "create" | "destroy" | number;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type MaterialReducer = {
		/** Versions: 1.17.30 – 1.26.60 */
		mix: number;
		/** Versions: 1.17.30 – 1.26.60 */
		items: {
			network_id: number;
			count: number;
		};
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type packet_edu_uri_resource_packet = {
		/** Versions: 1.17.30 – 1.26.60 */
		resource: EducationSharedResourceURI;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type packet_create_photo = {
		/** Versions: 1.17.30 – 1.26.60 */
		entity_unique_id: Int64Write;
		/** Versions: 1.17.30 – 1.26.60 */
		photo_name: string;
		/** Versions: 1.17.30 – 1.26.60 */
		item_name: string;
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type packet_update_subchunk_blocks = {
		/** Versions: 1.17.30 – 1.26.60 */
		x: number;
		/** Versions: 1.17.30 – 1.26.60 */
		y: number;
		/** Versions: 1.17.30 – 1.26.60 */
		z: number;
		/** Versions: 1.17.30 – 1.26.60 */
		blocks: BlockUpdate[];
		/** Versions: 1.17.30 – 1.26.60 */
		extra: BlockUpdate[];
	};
	/**
	 * Versions: 1.17.30 – 1.26.60
	 */
	export type packet_photo_info_request = {
		/** Versions: 1.17.30 – 1.26.60 */
		photo_id: bigint | number;
	};
	/**
	 * Versions: 1.17.40 – 1.26.60
	 */
	export type packet_subchunk = {
		/** Versions: 1.17.40 – 1.26.60 */
		dimension: number;
		/** Versions: 1.17.40 – 1.18.0 */
		x?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		y?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		z?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		data?: ByteArray | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		request_result?: "undefined" | "success" | "chunk_not_found" | "invalid_dimension" | "player_not_found" | "y_index_out_of_bounds" | number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		heightmap_type?: "no_data" | "has_data" | "too_high" | "too_low" | number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		heightmap?: Buffer | undefined;
		/** Versions: 1.18.0 – 1.26.60 */
		cache_enabled?: boolean | undefined;
		/** Versions: 1.18.0 */
		blob_id?: Int64Write | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		origin?: vec3i | vec3li | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		entries?: SubChunkEntryWithCaching | SubChunkEntryWithoutCaching | SubChunkEntry | undefined;
	};
	/**
	 * Versions: 1.17.40 – 1.26.60
	 */
	export type packet_subchunk_request = {
		/** Versions: 1.17.40 – 1.26.60 */
		dimension: number;
		/** Versions: 1.17.40 – 1.18.0 */
		x?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		y?: number | undefined;
		/** Versions: 1.17.40 – 1.18.0 */
		z?: number | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		origin?: vec3i | vec3li | undefined;
		/** Versions: 1.18.11 – 1.26.60 */
		requests?: {
			dx: number;
			dy: number;
			dz: number;
		}[] | vec3i8[] | undefined;
	};
	/**
	 * Versions: 1.18.11 – 1.26.60
	 */
	export type DeviceOS = "Undefined" | "Android" | "IOS" | "OSX" | "FireOS" | "GearVR" | "Hololens" | "Win10" | "Win32" | "Dedicated" | "TVOS" | "Orbis" | "NintendoSwitch" | "Xbox" | "WindowsPhone" | number | "Linux";
	/**
	 * Versions: 1.18.11 – 1.26.30
	 */
	export type SubChunkEntryWithoutCaching = {
		dx: number;
		dy: number;
		dz: number;
		result: "undefined" | "success" | "chunk_not_found" | "invalid_dimension" | "player_not_found" | "y_index_out_of_bounds" | "success_all_air" | number;
		payload: ByteArray;
		heightmap_type: "no_data" | "has_data" | "too_high" | "too_low" | number | HeightMapDataType;
		heightmap?: Buffer | undefined;
		render_heightmap_type?: HeightMapDataType | undefined;
		render_heightmap?: Buffer | undefined;
	}[];
	/**
	 * Versions: 1.18.11 – 1.26.30
	 */
	export type SubChunkEntryWithCaching = {
		dx: number;
		dy: number;
		dz: number;
		result: "undefined" | "success" | "chunk_not_found" | "invalid_dimension" | "player_not_found" | "y_index_out_of_bounds" | "success_all_air" | number;
		payload?: ByteArray | undefined;
		heightmap_type: "no_data" | "has_data" | "too_high" | "too_low" | number | HeightMapDataType;
		heightmap?: Buffer | undefined;
		blob_id: Int64Write;
		render_heightmap_type?: HeightMapDataType | undefined;
		render_heightmap?: Buffer | undefined;
	}[];
	/**
	 * Versions: 1.18.11 – 1.26.60
	 */
	export type packet_client_start_item_cooldown = {
		/** Versions: 1.18.11 – 1.26.60 */
		category: string;
		/** Versions: 1.18.11 – 1.26.60 */
		duration: number;
	};
	/**
	 * Versions: 1.18.11 – 1.26.60
	 */
	export type packet_script_message = {
		/** Versions: 1.18.11 – 1.26.60 */
		message_id: string;
		/** Versions: 1.18.11 – 1.26.60 */
		data: string;
	};
	/**
	 * Versions: 1.18.11 – 1.26.60
	 */
	export type packet_code_builder_source = {
		/** Versions: 1.18.11 – 1.26.60 */
		operation: "none" | "get" | "set" | "reset" | number;
		/** Versions: 1.18.11 – 1.26.60 */
		category: "none" | "code_status" | "instantiation" | number;
		/** Versions: 1.18.11 – 1.20.80 */
		value?: string | undefined;
		/** Versions: 1.21.0 – 1.26.60 */
		code_status?: "none" | "not_started" | "in_progress" | "paused" | "error" | "succeeded" | number | undefined;
	};
	/**
	 * TickingAreasLoadStatus is sent by the server to the client to notify the client of a ticking area's loading status.
	 * Versions: 1.18.30 – 1.26.60
	 */
	export type packet_ticking_areas_load_status = {
		/** Preload is true if the server is waiting for the area's preload. Versions: 1.18.30 – 1.26.60 */
		preload: boolean;
	};
	/**
	 * DimensionData is a packet sent from the server to the client containing information about data-driven dimensions
	 * that the server may have registered. This packet does not seem to be sent by default, rather only being sent when
	 * any data-driven dimensions are registered.
	 * Versions: 1.18.30 – 1.26.60
	 */
	export type packet_dimension_data = {
		/** Versions: 1.18.30 – 1.26.60 */
		definitions: {
			id: string;
			max_height?: number | undefined;
			min_height?: number | undefined;
			generator: "legacy" | "overworld" | "flat" | "nether" | "end" | "void" | number;
			dimension_type?: number | undefined;
			pack_id?: string | undefined;
			min_y?: number | undefined;
			height_range?: number | undefined;
			default_biome?: string | undefined;
			cloud_height?: number | undefined;
			render_clouds?: boolean | undefined;
		}[];
	};
	/**
	 * AgentAction is an Education Edition packet sent from the server to the client to return a response to a
	 * previously requested action.
	 * Versions: 1.18.30 – 1.26.60
	 */
	export type packet_agent_action = {
		/** Versions: 1.18.30 – 1.26.60 */
		request_id: string;
		/** Versions: 1.18.30 – 1.26.60 */
		action_type: "none" | "attack" | "collect" | "destroy" | "detect_redstone" | "detect_obstacle" | "drop" | "drop_all" | "inspect" | "inspect_data" | "inspect_item_count" | "inspect_item_detail" | "inspect_item_space" | "interact" | "move" | "place_block" | "till" | "transfer_item_to" | "turn" | number;
		/** Versions: 1.18.30 – 1.26.60 */
		body: string;
	};
	/**
	 * ChangeMobProperty is a packet sent from the server to the client to change one of the properties of a mob client-side.
	 * Versions: 1.18.30 – 1.26.60
	 */
	export type packet_change_mob_property = {
		/** EntityUniqueID is the unique ID of the entity whose property is being changed. Versions: 1.18.30 – 1.26.60 */
		entity_unique_id: bigint | number;
		/** Property is the name of the property being updated. Versions: 1.18.30 – 1.26.60 */
		property: string;
		/** BoolValue is set if the property value is a bool type. If the type is not a bool, this field is ignored. Versions: 1.18.30 – 1.26.60 */
		bool_value: boolean;
		/** StringValue is set if the property value is a string type. If the type is not a string, this field is ignored. Versions: 1.18.30 – 1.26.60 */
		string_value: string;
		/** IntValue is set if the property value is an int type. If the type is not an int, this field is ignored. Versions: 1.18.30 – 1.26.60 */
		int_value: number;
		/** FloatValue is set if the property value is a float type. If the type is not a float, this field is ignored. Versions: 1.18.30 – 1.26.60 */
		float_value: number;
	};
	/**
	 * # Permissions
	 * The permission level of a player, for example whether they are an Server Operator or not.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type PermissionLevel = "visitor" | "member" | "operator" | "custom" | number;
	/**
	 * LessonProgress is a packet sent by the server to the client to inform the client of updated progress on a lesson.
	 * This packet only functions on the Minecraft: Education Edition version of the game.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type packet_lesson_progress = {
		/** Action is the action the client should perform to show progress. This is one of the constants defined above. Versions: 1.19.1 – 1.26.60 */
		action: number;
		/** Score is the score the client should use when displaying the progress. Versions: 1.19.1 – 1.26.60 */
		score: number;
		/** Identifier is the identifier of the lesson that is being progressed. Versions: 1.19.1 – 1.26.60 */
		identifier: string;
	};
	/**
	 * RequestAbility is a packet sent by the client to the server to request permission for a specific ability from the
	 * server.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type packet_request_ability = {
		/** Ability is the ability that the client is requesting. This is one of the constants defined above. Versions: 1.19.1 – 1.26.60 */
		ability: "build" | "mine" | "doors_and_switches" | "open_containers" | "attack_players" | "attack_mobs" | "operator_commands" | "teleport" | "invulnerable" | "flying" | "may_fly" | "instant_build" | "lightning" | "fly_speed" | "walk_speed" | "muted" | "world_builder" | "no_clip" | "ability_count" | number;
		/** Value type decides which of the fields you should read/write from Versions: 1.19.1 – 1.26.60 */
		value_type: "bool" | "float" | number;
		/** If value type is bool, use this value Versions: 1.19.1 – 1.26.60 */
		bool_value: boolean;
		/** If value type is float, use this value Versions: 1.19.1 – 1.26.60 */
		float_val: number;
	};
	/**
	 * RequestPermissions is a packet sent from the client to the server to request permissions that the client does not
	 * currently have. It can only be sent by operators and host in vanilla Minecraft.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type packet_request_permissions = {
		/** EntityUniqueID is the unique ID of the player. The unique ID is unique for the entire world and is often used in packets. Most servers send an EntityUniqueID equal to the EntityRuntimeID. Versions: 1.19.1 – 1.26.60 */
		entity_unique_id: Int64Write;
		/** PermissionLevel is the current permission level of the player. Same as constants in AdventureSettings packet. Versions: 1.19.1 – 1.26.60 */
		permission_level: PermissionLevel;
		/** RequestedPermissions contains the requested permission flags. Versions: 1.19.1 – 1.26.60 */
		requested_permissions: RequestPermissions;
	};
	/**
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type RequestPermissions = {
		/** Versions: 1.19.1 – 1.26.60 */
		_value?: number | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		build?: boolean | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		mine?: boolean | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		doors_and_switches?: boolean | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		open_containers?: boolean | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		attack_players?: boolean | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		attack_mobs?: boolean | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		operator?: boolean | undefined;
		/** Versions: 1.19.1 – 1.26.60 */
		teleport?: boolean | undefined;
	};
	/**
	 * ToastRequest is a packet sent from the server to the client to display a toast to the top of the screen. These toasts
	 * are the same as the ones seen when, for example, loading a new resource pack or obtaining an achievement.
	 * Versions: 1.19.1 – 1.26.60
	 */
	export type packet_toast_request = {
		/** Title is the title of the toast. Versions: 1.19.1 – 1.26.60 */
		title: string;
		/** Message is the message that the toast may contain alongside the title. Versions: 1.19.1 – 1.26.60 */
		message: string;
	};
	/**
	 * The command permission level, for example if being run by a Player, an Op, or a Command Block.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type CommandPermissionLevel = "normal" | "operator" | "automation" | "host" | "owner" | "internal" | number;
	/**
	 * The command permission level, for example if being run by a Player, an Op, or a Command Block.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type CommandPermissionLevelVarint = "normal" | "operator" | "automation" | "host" | "owner" | "internal" | number;
	/**
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type AbilitySet = {
		/** Versions: 1.19.10 – 1.26.60 */
		_value?: number | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		build?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		mine?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		doors_and_switches?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		open_containers?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		attack_players?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		attack_mobs?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		operator_commands?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		teleport?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		invulnerable?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		flying?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		may_fly?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		instant_build?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		lightning?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		fly_speed?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		walk_speed?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		muted?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		world_builder?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		no_clip?: boolean | undefined;
		/** Versions: 1.19.10 – 1.26.60 */
		count?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		privileged_builder?: boolean | undefined;
		/** Versions: 1.21.60 – 1.26.60 */
		vertical_fly_speed?: boolean | undefined;
	};
	/**
	 * AbilityLayer represents the abilities of a specific layer, such as the base layer or the spectator layer.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type AbilityLayers = {
		/** Type represents the type of the layer. This is one of the AbilityLayerType constants defined above. Versions: 1.19.10 – 1.26.60 */
		type: "cache" | "base" | "spectator" | "commands" | number | "editor" | "loading_screen";
		/** The abilities that can be toggled between Versions: 1.19.10 – 1.26.60 */
		allowed: AbilitySet;
		/** The abilities that are currently active Versions: 1.19.10 – 1.26.60 */
		enabled: AbilitySet;
		/** FlySpeed is the default horizontal fly speed of the layer. Versions: 1.19.10 – 1.26.60 */
		fly_speed: number;
		/** WalkSpeed is the default walk speed of the layer. Versions: 1.19.10 – 1.26.60 */
		walk_speed: number;
		/** VerticalFlySpeed is the default vertical fly speed of the layer. Versions: 1.21.60 – 1.26.60 */
		vertical_fly_speed?: number | undefined;
	};
	/**
	 * UpdateAbilities is a packet sent from the server to the client to update the abilities of the player. It, along with
	 * the UpdateAdventureSettings packet, are replacements of the AdventureSettings packet since v1.19.10.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type packet_update_abilities = {
		/** EntityUniqueID is the unique ID of the player. The unique ID is a value that remains consistent across different sessions of the same world, but most servers simply fill the runtime ID of the entity out for this field. Versions: 1.19.10 – 1.26.60 */
		entity_unique_id: Int64Write;
		/** PlayerPermissions is the permission level of the player. It is a value from 0-3, with 0 being visitor, 1 being member, 2 being operator and 3 being custom. Versions: 1.19.10 – 1.26.60 */
		permission_level: PermissionLevel;
		/** CommandPermissions is a permission level that specifies the kind of commands that the player is allowed to use. It is one of the CommandPermissionLevel constants in the AdventureSettings packet. Versions: 1.19.10 – 1.26.60 */
		command_permission: CommandPermissionLevel;
		/** Layers contains all ability layers and their potential values. This should at least have one entry, being the base layer. Versions: 1.19.10 – 1.26.60 */
		abilities: AbilityLayers[];
	};
	/**
	 * UpdateAdventureSettings is a packet sent from the server to the client to update the adventure settings of the player.
	 * It, along with the UpdateAbilities packet, are replacements of the AdventureSettings packet since v1.19.10.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type packet_update_adventure_settings = {
		/** NoPvM is a boolean indicating whether the player is allowed to fight mobs or not. Versions: 1.19.10 – 1.26.60 */
		no_pvm: boolean;
		/** NoMvP is a boolean indicating whether mobs are allowed to fight the player or not. It is unclear why this is sent to the client. Versions: 1.19.10 – 1.26.60 */
		no_mvp: boolean;
		/** ImmutableWorld is a boolean indicating whether the player is allowed to modify the world or not. Versions: 1.19.10 – 1.26.60 */
		immutable_world: boolean;
		/** ShowNameTags is a boolean indicating whether player name tags are shown or not. Versions: 1.19.10 – 1.26.60 */
		show_name_tags: boolean;
		/** AutoJump is a boolean indicating whether the player is allowed to jump automatically or not. Versions: 1.19.10 – 1.26.60 */
		auto_jump: boolean;
	};
	/**
	 * DeathInfo is a packet sent from the server to the client expected to be sent when a player dies. It contains messages
	 * related to the player's death, which are shown on the death screen as of v1.19.10.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type packet_death_info = {
		/** Cause is the cause of the player's death, such as "suffocation" or "suicide". Versions: 1.19.10 – 1.26.60 */
		cause: string;
		/** Messages is a list of death messages to be shown on the death screen. Versions: 1.19.10 – 1.26.60 */
		messages: string[];
	};
	/**
	 * EditorNetwork is a packet sent from the server to the client and vise-versa to communicate editor-mode related
	 * information. It carries a single compound tag containing the relevant information.
	 * Versions: 1.19.10 – 1.26.60
	 */
	export type packet_editor_network = {
		/** Payload is a network little endian compound tag holding data relevant to the editor. Versions: 1.19.10 – 1.26.60 */
		payload: NBT;
		/** Versions: 1.21.20 – 1.26.60 */
		route_to_manager?: boolean | undefined;
	};
	/**
	 * FeatureRegistry is a packet used to notify the client about the world generation features the server is currently
	 * using. This is used in combination with the client-side world generation system introduced in v1.19.20, allowing the
	 * client to completely generate the chunks of the world without having to rely on the server.
	 * Versions: 1.19.20 – 1.26.60
	 */
	export type packet_feature_registry = {
		/** Features is a slice of all registered world generation features. Versions: 1.19.20 – 1.26.60 */
		features: {
			name: string;
			options: string;
		}[];
	};
	/**
	 * ServerStats is a packet sent from the server to the client to update the client on server statistics. It is purely
	 * used for telemetry.
	 * Versions: 1.19.30 – 1.26.60
	 */
	export type packet_server_stats = {
		/** Versions: 1.19.30 – 1.26.60 */
		server_time: number;
		/** Versions: 1.19.30 – 1.26.60 */
		network_time: number;
	};
	/**
	 * Versions: 1.19.30 – 1.26.60
	 */
	export type packet_request_network_settings = {
		/** Versions: 1.19.30 – 1.26.60 */
		client_protocol: number;
	};
	/**
	 * Versions: 1.19.30 – 1.26.60
	 */
	export type packet_game_test_request = {
		/** MaxTestsPerBatch ... Versions: 1.19.30 – 1.26.60 */
		max_tests_per_batch: number;
		/** Repetitions represents the amount of times the test will be run. Versions: 1.19.30 – 1.26.60 */
		repetitions: number;
		/** Rotation represents the rotation of the test. It is one of the constants above. Versions: 1.19.30 – 1.26.60 */
		rotation: "0deg" | "90deg" | "180deg" | "270deg" | "360deg" | number;
		/** Versions: 1.19.30 – 1.26.60 */
		stop_on_error: boolean;
		/** Versions: 1.19.30 – 1.26.60 */
		position: BlockCoordinates;
		/** Versions: 1.19.30 – 1.26.60 */
		tests_per_row: number;
		/** Versions: 1.19.30 – 1.26.60 */
		name: string;
	};
	/**
	 * Versions: 1.19.30 – 1.26.60
	 */
	export type packet_game_test_results = {
		/** Versions: 1.19.30 – 1.26.60 */
		succeeded: boolean;
		/** Versions: 1.19.30 – 1.26.60 */
		error: string;
		/** Versions: 1.19.30 – 1.26.60 */
		name: string;
	};
	/**
	 * Versions: 1.19.40 – 1.26.60
	 */
	export type EntityProperties = {
		/** Versions: 1.19.40 – 1.26.60 */
		ints: {
			index: number;
			value: number;
		}[];
		/** Versions: 1.19.40 – 1.26.60 */
		floats: {
			index: number;
			value: number;
		}[];
	};
	/**
	 * Versions: 1.19.50 – 1.26.60
	 */
	export type InputLockFlags = {
		/** Versions: 1.19.50 – 1.26.60 */
		_value?: number | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		move?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		jump?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		sneak?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		mount?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		dismount?: boolean | undefined;
		/** Versions: 1.19.50 – 1.26.60 */
		rotation?: boolean | undefined;
	};
	/**
	 * Versions: 1.19.50 – 1.26.60
	 */
	export type packet_update_client_input_locks = {
		/** Versions: 1.19.50 – 1.26.60 */
		locks: InputLockFlags;
		/** Versions: 1.19.50 – 1.26.0 */
		position?: vec3f | undefined;
	};
	/**
	 * Versions: 1.19.60 – 1.26.60
	 */
	export type packet_client_cheat_ability = {
		/** Versions: 1.19.60 – 1.26.60 */
		entity_unique_id: Int64Write;
		/** Versions: 1.19.60 – 1.26.60 */
		permission_level: PermissionLevel;
		/** Versions: 1.19.60 – 1.26.60 */
		command_permission: CommandPermissionLevel;
		/** Versions: 1.19.60 – 1.26.60 */
		abilities: AbilityLayers[];
	};
	/**
	 * Versions: 1.19.70 – 1.26.60
	 */
	export type packet_camera_presets = {
		/** Versions: 1.19.70 – 1.20.10 */
		data?: NBT | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		presets?: CameraPresets[] | undefined;
	};
	/**
	 * Versions: 1.19.70 – 1.26.60
	 */
	export type packet_unlocked_recipes = {
		/** Versions: 1.19.70 – 1.19.80 */
		new_unlocks?: boolean | undefined;
		/** Versions: 1.19.70 – 1.26.60 */
		recipes: string[];
		/** Versions: 1.20.0 – 1.26.60 */
		unlock_type?: "empty" | "initially_unlocked" | "newly_unlocked" | "remove_unlocked" | "remove_all_unlocked" | number | undefined;
	};
	/**
	 * Versions: 1.19.70 – 1.26.60
	 */
	export type packet_camera_instruction = {
		/** Versions: 1.19.70 – 1.20.10 */
		data?: NBT | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		instruction_set?: {
			runtime_id: number;
			ease_data?: {
				type: "Linear" | "Spring" | "InQuad" | "OutQuad" | "InOutQuad" | "InCubic" | "OutCubic" | "InOutCubic" | "InQuart" | "OutQuart" | "InOutQuart" | "InQuint" | "OutQuint" | "InOutQuint" | "InSine" | "OutSine" | "InOutSine" | "InExpo" | "OutExpo" | "InOutExpo" | "InCirc" | "OutCirc" | "InOutCirc" | "InBounce" | "OutBounce" | "InOutBounce" | "InBack" | "OutBack" | "InOutBack" | "InElastic" | "OutElastic" | "InOutElastic" | number | EaseType;
				duration: number;
			} | undefined;
			position?: vec3f | undefined;
			rotation?: vec2f | undefined;
			facing?: vec3f | undefined;
			default?: boolean | undefined;
			offset?: vec2f | undefined;
			entity_offset?: vec3f | undefined;
			remove_ignore_starting_values?: boolean | undefined;
		} | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		clear?: boolean | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		fade?: {
			fade_in_duration: number;
			wait_duration: number;
			fade_out_duration: number;
			color_rgb: vec3f;
		} | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		target?: {
			offset?: vec3f | undefined;
			entity_unique_id: Int64Write;
		} | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		remove_target?: boolean | undefined;
		/** Versions: 1.21.100 – 1.26.60 */
		fov?: {
			field_of_view: number;
			ease_time: number;
			ease_type: EaseType;
			clear: boolean;
		} | undefined;
		/** Versions: 1.21.120 – 1.26.60 */
		spline?: CameraSplineInstruction | undefined;
		/** Versions: 1.21.120 – 1.26.60 */
		attach_to_entity?: Int64Write | undefined;
		/** Versions: 1.21.120 – 1.26.60 */
		detach_from_entity?: boolean | undefined;
	};
	/**
	 * Versions: 1.19.80 – 1.26.60
	 */
	export type packet_compressed_biome_definitions = {
		/** Versions: 1.19.80 – 1.26.60 */
		raw_payload: string | ByteArray;
	};
	/**
	 * Versions: 1.19.80 – 1.26.60
	 */
	export type packet_trim_data = {
		/** Versions: 1.19.80 – 1.26.60 */
		patterns: {
			item_name: string;
			pattern: string;
		}[];
		/** Versions: 1.19.80 – 1.26.60 */
		materials: {
			material: string;
			color: string;
			item_name: string;
		}[];
	};
	/**
	 * Versions: 1.19.80 – 1.26.60
	 */
	export type packet_open_sign = {
		/** Versions: 1.19.80 – 1.26.60 */
		position: BlockCoordinates;
		/** Versions: 1.19.80 – 1.26.60 */
		is_front: boolean;
	};
	/**
	 * agent_animation is an Education Edition packet sent from the server to the client to make an agent perform an animation.
	 * Versions: 1.20.10 – 1.26.60
	 */
	export type packet_agent_animation = {
		/** animation is the ID of the animation that the agent should perform. As of its implementation, there are no IDs that can be used in the regular client. Versions: 1.20.10 – 1.26.60 */
		animation: "arm_swing" | "shrug" | number;
		/** entity_runtime_id is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.20.10 – 1.26.60 */
		entity_runtime_id: bigint | number;
	};
	/**
	 * Versions: 1.20.30 – 1.26.60
	 */
	export type Vec3fopts = {
		/** Versions: 1.20.30 – 1.26.60 */
		x?: number | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		y?: number | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		z?: number | undefined;
	};
	/**
	 * Versions: 1.20.30 – 1.26.60
	 */
	export type Vec2fopts = {
		/** Versions: 1.20.30 – 1.26.60 */
		x?: number | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		y?: number | undefined;
	};
	/**
	 * Versions: 1.20.30 – 1.26.60
	 */
	export type CameraPresets = {
		/** Name is the name of the preset. Each preset must have their own unique name. Versions: 1.20.30 – 1.26.60 */
		name: string;
		/** Parent is the name of the preset that this preset extends upon. This can be left empty. Versions: 1.20.30 – 1.26.60 */
		parent: string;
		/** Versions: 1.20.30 – 1.26.60 */
		position: Vec3fopts;
		/** Versions: 1.20.30 – 1.26.60 */
		rotation: Vec2fopts;
		/** Versions: 1.20.30 – 1.26.60 */
		audio_listener?: number | undefined;
		/** Versions: 1.20.30 – 1.26.60 */
		player_effects?: boolean | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		offset?: vec2f | undefined;
		/** Versions: 1.21.20 – 1.26.60 */
		radius?: number | undefined;
		/** Versions: 1.21.30 – 1.26.60 */
		rotation_speed?: number | undefined;
		/** Versions: 1.21.30 – 1.26.60 */
		snap_to_target?: boolean | undefined;
		/** Versions: 1.21.30 – 1.26.60 */
		entity_offset?: vec3f | undefined;
		/** Versions: 1.21.42 – 1.26.60 */
		horizontal_rotation_limit?: vec2f | undefined;
		/** Versions: 1.21.42 – 1.26.60 */
		vertical_rotation_limit?: vec2f | undefined;
		/** Versions: 1.21.42 – 1.26.60 */
		continue_targeting?: boolean | undefined;
		/** Versions: 1.21.42 – 1.21.80 */
		align_target_and_camera_forward?: boolean | undefined;
		/** Versions: 1.21.50 – 1.26.60 */
		tracking_radius?: number | undefined;
		/** Versions: 1.21.50 – 1.26.60 */
		aim_assist?: {
			preset_id?: string | undefined;
			target_mode?: "angle" | "distance" | number | undefined;
			angle?: vec2f | undefined;
			distance?: number | undefined;
		} | undefined;
		/** Versions: 1.21.60 – 1.26.60 */
		yaw_limit_min?: number | undefined;
		/** Versions: 1.21.60 – 1.26.60 */
		yaw_limit_max?: number | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		control_scheme?: "locked_player_relative_strafe" | "camera_relative" | "camera_relative_strafe" | "player_relative" | "player_relative_strafe" | number | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		apply_inherited_starting_rotation?: boolean | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		starting_rotation?: vec2f | undefined;
	};
	/**
	 * RefreshEntitlements is sent by the client to the server to refresh the entitlements of the player.
	 * Versions: 1.20.30 – 1.26.60
	 */
	export type packet_refresh_entitlements = Record<string, never>;
	/**
	 * Versions: 1.20.40 – 1.26.60
	 */
	export type DisconnectFailReason = "unknown" | "cant_connect_no_internet" | "no_permissions" | "unrecoverable_error" | "third_party_blocked" | "third_party_no_internet" | "third_party_bad_ip" | "third_party_no_server_or_server_locked" | "version_mismatch" | "skin_issue" | "invite_session_not_found" | "edu_level_settings_missing" | "local_server_not_found" | "legacy_disconnect" | "user_leave_game_attempted" | "platform_locked_skins_error" | "realms_world_unassigned" | "realms_server_cant_connect" | "realms_server_hidden" | "realms_server_disabled_beta" | "realms_server_disabled" | "cross_platform_disallowed" | "cant_connect" | "session_not_found" | "client_settings_incompatible_with_server" | "server_full" | "invalid_platform_skin" | "edition_version_mismatch" | "edition_mismatch" | "level_newer_than_exe_version" | "no_fail_occurred" | "banned_skin" | "timeout" | "server_not_found" | "outdated_server" | "outdated_client" | "no_premium_platform" | "multiplayer_disabled" | "no_wifi" | "world_corruption" | "no_reason" | "disconnected" | "invalid_player" | "logged_in_other_location" | "server_id_conflict" | "not_allowed" | "not_authenticated" | "invalid_tenant" | "unknown_packet" | "unexpected_packet" | "invalid_command_request_packet" | "host_suspended" | "login_packet_no_request" | "login_packet_no_cert" | "missing_client" | "kicked" | "kicked_for_exploit" | "kicked_for_idle" | "resource_pack_problem" | "incompatible_pack" | "out_of_storage" | "invalid_level" | "disconnect_packet_deprecated" | "block_mismatch" | "invalid_heights" | "invalid_widths" | "connection_lost" | "zombie_connection" | "shutdown" | "reason_not_set" | "loading_state_timeout" | "resource_pack_loading_failed" | "searching_for_session_loading_screen_failed" | "conn_protocol_version" | "subsystem_status_error" | "empty_auth_from_discovery" | "empty_url_from_discovery" | "expired_auth_from_discovery" | "unknown_signal_service_sign_in_failure" | "xbl_join_lobby_failure" | "unspecified_client_instance_disconnection" | "conn_session_not_found" | "conn_create_peer_connection" | "conn_ice" | "conn_connect_request" | "conn_connect_response" | "conn_negotiation_timeout" | "conn_inactivity_timeout" | "stale_connection_being_replaced" | "realms_session_not_found" | "bad_packet" | number | "conn_failed_to_create_offer" | "conn_failed_to_create_answer" | "conn_failed_to_set_local_description" | "conn_failed_to_set_remote_description" | "conn_negotiation_timeout_waiting_for_response" | "conn_negotiation_timeout_waiting_for_accept" | "conn_incoming_connection_ignored" | "conn_signaling_parsing_failure" | "conn_signaling_unknown_error" | "conn_signaling_unicast_delivery_failed" | "conn_signaling_broadcast_delivery_failed" | "conn_signaling_generic_delivery_failed" | "editor_mismatch_editor_world" | "editor_mismatch_vanilla_world" | "world_transfer_not_primary_client" | "server_shutdown" | "game_setup_cancelled" | "game_setup_failed" | "no_venue" | "conn_signalling_sign_in_failed" | "session_access_denied" | "service_sign_in_issue" | "conn_no_signaling_channel" | "conn_not_logged_in" | "conn_client_signalling_error" | "sub_client_login_disabled" | "deep_link_trying_to_open_demo_world_while_signed_in" | "async_join_task_denied" | "realms_timeline_required" | "guest_withough_host" | "failed_to_join_experience" | "host_signed_out" | "script_watchdog_exception" | "script_memory_limit_exceeded" | "storage_low_during_gameplay" | "storage_full_during_gameplay" | "level_storage_corruption" | "edition_mismatch_vanilla_to_edu" | "edition_mismatch_edu_to_vanilla" | "editor_mismatch_editor_to_vanilla" | "editor_mismatch_vanilla_to_editor" | "deny_listed" | "nonce_missing" | "nonce_not_found" | "nonce_expired" | "nonce_not_valid" | "nethernet_data_channel_closed" | "discovery_environment_mismatch" | "host_without_keys" | "host_disconnected" | "editor_join_intent_policy_failure" | "nethernet_identity_not_allowed" | "invalid_name" | "expired_token" | "host_accepts_no_type_of_auth" | "not_authenticated_fast_fail" | "editor_not_allowed" | "missing_structure_data" | "unsupported_transport" | "sub_client_login_not_bound";
	/**
	 * Versions: 1.20.50 – 1.26.60
	 */
	export type vec3li = {
		/** Versions: 1.20.50 – 1.26.60 */
		x: number;
		/** Versions: 1.20.50 – 1.26.60 */
		y: number;
		/** Versions: 1.20.50 – 1.26.60 */
		z: number;
	};
	/**
	 * Versions: 1.20.50 – 1.26.60
	 */
	export type packet_toggle_crafter_slot_request = {
		/** Versions: 1.20.50 – 1.26.60 */
		position: vec3li;
		/** Versions: 1.20.50 – 1.26.60 */
		slot: number;
		/** Versions: 1.20.50 – 1.26.60 */
		disabled: boolean;
	};
	/**
	 * Versions: 1.20.50 – 1.26.60
	 */
	export type packet_set_player_inventory_options = {
		/** Versions: 1.20.50 – 1.26.60 */
		left_tab: "none" | "construction" | "equipment" | "items" | "nature" | "search" | "survival" | number;
		/** Versions: 1.20.50 – 1.26.60 */
		right_tab: "none" | "fullscreen" | "crafting" | "armor" | number;
		/** Versions: 1.20.50 – 1.26.60 */
		filtering: boolean;
		/** Versions: 1.20.50 – 1.26.60 */
		layout: "none" | "survival" | "recipe_book" | "creative" | number | "inventory_only" | "default" | "recipe_book_only";
		/** Versions: 1.20.50 – 1.26.60 */
		crafting_layout: "none" | "survival" | "recipe_book" | "creative" | number | "inventory_only" | "default" | "recipe_book_only";
	};
	/**
	 * Versions: 1.20.50 – 1.26.60
	 */
	export type packet_server_post_move = {
		/** Versions: 1.20.50 – 1.26.60 */
		position: vec3f;
	};
	/**
	 * SetHud is sent by the server to set the visibility of individual HUD elements on the client. It is
	 * important to note that the client does not reset the state of the HUD elements after it leaves a server,
	 * meaning they can leak into sessions on different servers. To be safe, you should reset the visibility of
	 * all HUD elements when a player connects.
	 * Versions: 1.20.61 – 1.26.60
	 */
	export type packet_set_hud = {
		/** Elements is a list of HUD elements that are being modified. The values can be any of the HudElement constants above. Versions: 1.20.61 – 1.26.60 */
		elements: Element[];
		/** Visibility represents the new visibility of the specified Elements. It can be any of the HudVisibility constants above. Versions: 1.20.61 – 1.26.60 */
		visibility: "hide" | "reset" | number;
	};
	/**
	 * Versions: 1.20.61 – 1.26.60
	 */
	export type Element = "PaperDoll" | "Armour" | "ToolTips" | "TouchControls" | "Crosshair" | "HotBar" | "Health" | "ProgressBar" | "Hunger" | "AirBubbles" | "HourseHealth" | number | "VehicleHealth" | "EffectsBar" | "ItemTextPopup";
	/**
	 * As of 1.26.40 the context is a zigzag32 and the ingredient list is written as an optional (present only
	 * when the context is 'none') rather than being inferred from the context alone.
	 * Versions: 1.21.0 – 1.26.60
	 */
	export type RecipeUnlockingRequirement = {
		/** Versions: 1.21.0 – 1.26.60 */
		context: "none" | "always_unlocked" | "player_in_water" | "player_has_many_items" | number;
		/** Versions: 1.21.0 – 1.26.60 */
		ingredients?: RecipeIngredient[] | undefined;
	};
	/**
	 * Versions: 1.21.0 – 1.26.60
	 */
	export type packet_award_achievement = {
		/** Versions: 1.21.0 – 1.26.60 */
		achievement_id: number;
	};
	/**
	 * clientbound_close_form is sent by the server to clear the entire form stack of the client. This means that all
	 * forms that are currently open will be closed. This does not affect inventories and other containers.
	 * Versions: 1.21.2 – 1.26.60
	 */
	export type packet_clientbound_close_form = Record<string, never>;
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type FullContainerName = {
		/** Versions: 1.21.20 – 1.26.60 */
		container_id: ContainerSlotType;
		/** Versions: 1.21.20 – 1.26.60 */
		dynamic_container_id?: number | undefined;
	};
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type packet_serverbound_loading_screen = {
		/** Versions: 1.21.20 – 1.26.60 */
		type: number;
		/** Versions: 1.21.20 – 1.26.60 */
		loading_screen_id?: number | undefined;
	};
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type packet_jigsaw_structure_data = {
		/** Versions: 1.21.20 – 1.26.60 */
		structure_data: NBT;
	};
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type packet_current_structure_feature = {
		/** Versions: 1.21.20 – 1.26.60 */
		current_feature: string;
	};
	/**
	 * Versions: 1.21.20 – 1.26.60
	 */
	export type packet_serverbound_diagnostics = {
		/** Versions: 1.21.20 – 1.26.60 */
		average_frames_per_second: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_server_sim_tick_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_client_sim_tick_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_begin_frame_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_input_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_render_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_end_frame_time: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_remainder_time_percent: number;
		/** Versions: 1.21.20 – 1.26.60 */
		average_unaccounted_time_percent: number;
		/** Versions: 1.26.0 – 1.26.60 */
		memory_category_values?: MemoryCategoryCounter[] | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		entity_diagnostics?: EntityDiagnosticTimingInfo[] | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		system_diagnostics?: SystemDiagnosticTimingInfo[] | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		whisker_scopes?: WhiskerScopeDataSummary[] | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		system_categories?: SystemCategory[] | undefined;
	};
	/**
	 * Versions: 1.21.30 – 1.26.60
	 */
	export type packet_camera_aim_assist = {
		/** Versions: 1.21.30 – 1.26.60 */
		view_angle: vec2f;
		/** Versions: 1.21.30 – 1.26.60 */
		distance: number;
		/** Versions: 1.21.30 – 1.26.60 */
		target_mode: number | "angle" | "distance";
		/** Versions: 1.21.30 – 1.26.60 */
		action: number | "set" | "clear";
		/** Versions: 1.21.50 – 1.26.60 */
		preset_id?: string | undefined;
		/** Versions: 1.21.100 – 1.26.60 */
		show_debug_render?: boolean | undefined;
	};
	/**
	 * Versions: 1.21.30 – 1.26.60
	 */
	export type packet_container_registry_cleanup = {
		/** Versions: 1.21.30 – 1.26.60 */
		removed_containers: FullContainerName[];
	};
	/**
	 * Versions: 1.21.42 – 1.26.60
	 */
	export type MovementEffectType = "GLIDE_BOOST" | "invalid" | number | "GEYSER_BOOST";
	/**
	 * Versions: 1.21.42 – 1.26.60
	 */
	export type packet_movement_effect = {
		/** Versions: 1.21.42 – 1.26.60 */
		runtime_id: bigint | number;
		/** Versions: 1.21.42 – 1.26.60 */
		effect_type: MovementEffectType;
		/** Versions: 1.21.42 – 1.26.60 */
		effect_duration: number;
		/** Versions: 1.21.42 – 1.26.60 */
		tick: bigint | number;
	};
	/**
	 * Versions: 1.21.42 – 1.26.60
	 */
	export type packet_set_movement_authority = {
		/** Versions: 1.21.42 – 1.26.60 */
		movement_authority: "client" | "server" | "server_with_rewind" | number;
	};
	/**
	 * CameraAimAssistPresets is sent by the server to the client to provide a list of categories and presets
	 * that can be used when sending a CameraAimAssist packet or a CameraInstruction including aim assist.
	 * Versions: 1.21.50 – 1.26.60
	 */
	export type packet_camera_aim_assist_presets = {
		/** CategoryGroups is a list of groups of categories which can be referenced by one of the Presets. Versions: 1.21.50 – 1.26.60 */
		categories: {
			/** Identifier is the unique identifier of the group. */
			name: string;
			/** Priorities represents the block and entity specific priorities for targetting. The aim assist will select the block or entity with the highest priority within the specified thresholds. */
			entity_priorities: {
				id: string;
				priority: number;
			}[];
			block_priorities: {
				id: string;
				priority: number;
			}[];
			entity_default?: number | undefined;
			block_default?: number | undefined;
			block_tags?: number[] | undefined;
			entity_type_families?: {
				id: string;
				priority: number;
			}[] | undefined;
		}[];
		/** Versions: 1.21.50 – 1.26.60 */
		presets: {
			id: string;
			exclude_blocks?: string[] | undefined;
			target_liquids: string[];
			item_settings: {
				/** Identifier of the item to apply the settings to. */
				id: string;
				/** Category is the identifier of a category to use which has been defined by a CameraAimAssistCategory. */
				category: string;
			}[];
			default_item_settings?: string | undefined;
			hand_settings?: string | undefined;
			exclusion_settings?: {
				blocks: string[];
				entities: string[];
				block_tags: string[];
				entity_type_families?: string[] | undefined;
			} | undefined;
		}[];
		/** Versions: 1.21.60 – 1.26.60 */
		operation?: "set" | "add_to_existing" | number | undefined;
	};
	/**
	 * ItemRegistryPacket is used to declare what items the server makes available, and components of custom items.
	 * After 1.21.60, this packet replaces the functionality of the "itemstates" field in the StartGamePacket
	 * In pre-1.21.60 versions, this was the ItemComponentPacket, and was
	 * sent by the server to attach client-side components to custom items.
	 * Versions: 1.21.60 – 1.26.60
	 */
	export type packet_item_registry = {
		/** `items` holds a list of all items. Versions: 1.21.60 – 1.26.60 */
		itemstates: Itemstates;
	};
	/**
	 * Versions: 1.21.60 – 1.26.60
	 */
	export type packet_client_camera_aim_assist = {
		/** !bound: client Versions: 1.21.60 – 1.26.60 */
		preset_id: string;
		/** Versions: 1.21.60 – 1.26.60 */
		action: "set_from_camera_preset" | "clear" | number;
		/** Versions: 1.21.60 – 1.26.60 */
		allow_aim_assist: boolean;
	};
	/**
	 * Versions: 1.21.60 – 1.26.60
	 */
	export type packet_client_movement_prediction_sync = {
		/** !bound: ? Versions: 1.21.60 – 1.26.60 */
		data_flags: bigint | number;
		/** Versions: 1.21.60 – 1.26.60 */
		bounding_box: {
			scale: number;
			width: number;
			height: number;
		};
		/** Versions: 1.21.60 – 1.26.60 */
		movement_speed: number;
		/** Versions: 1.21.60 – 1.26.60 */
		underwater_movement_speed: number;
		/** Versions: 1.21.60 – 1.26.60 */
		lava_movement_speed: number;
		/** Versions: 1.21.60 – 1.26.60 */
		jump_strength: number;
		/** Versions: 1.21.60 – 1.26.60 */
		health: number;
		/** Versions: 1.21.60 – 1.26.60 */
		hunger: number;
		/** Versions: 1.21.60 – 1.26.60 */
		entity_runtime_id: bigint | number;
		/** Versions: 1.21.70 – 1.26.60 */
		is_flying?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		unknown_attribute_1?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		unknown_attribute_2?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		unknown_attribute_3?: number | undefined;
	};
	/**
	 * Versions: 1.21.70 – 1.26.60
	 */
	export type packet_update_client_options = {
		/** Versions: 1.21.70 – 1.26.60 */
		graphics_mode?: "simple" | "fancy" | "advanced" | "ray_traced" | number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		filter_profanity?: boolean | undefined;
	};
	/**
	 * PlayerVideoCapturePacket is sent by the server to start or stop video recording for a player. This packet
	 * only works on development builds and has no effect on retail builds. When recording, the client will save
	 * individual frames to '/LocalCache/minecraftpe' in the format specified below.
	 * Versions: 1.21.70 – 1.26.60
	 */
	export type packet_player_video_capture = {
		/** action is the action that the client should perform. This is one of the constants defined above. Versions: 1.21.70 – 1.26.60 */
		action: "stop" | "start" | number;
		/** Versions: 1.21.70 – 1.26.60 */
		frame_rate?: number | undefined;
		/** Versions: 1.21.70 – 1.26.60 */
		file_prefix?: string | undefined;
	};
	/**
	 * PlayerUpdateEntityOverrides is sent by the server to modify an entity's properties individually.
	 * Versions: 1.21.70 – 1.26.60
	 */
	export type packet_player_update_entity_overrides = {
		/** EntityRuntimeID is the runtime ID of the entity. The runtime ID is unique for each world session, and entities are generally identified in packets using this runtime ID. Versions: 1.21.70 – 1.26.60 */
		runtime_id: bigint | number;
		/** PropertyIndex is the index of the property to modify. The index is unique for each property of an entity. Versions: 1.21.70 – 1.26.60 */
		property_index: number;
		/** Type is the type of action to perform with the property. It is one of the constants above. As of 1.26.40 it is sent twice: once as an unsigned varint and once as the legacy byte. Versions: 1.21.70 – 1.26.60 */
		type: "clear_all" | "remove" | "set_int" | "set_float" | number;
		/** Versions: 1.21.70 – 1.26.60 */
		value?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		legacy_type?: number | undefined;
	};
	/**
	 * BiomeDefinition represents a biome definition in the game. This can be a vanilla biome or a completely
	 * custom biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeDefinition = {
		/** NameIndex represents the index of the biome name in the string list from BiomeDefinitionListPacket. Versions: 1.21.80 – 1.26.60 */
		name_index: number;
		/** BiomeID is the biome ID. This is optional and can be empty. Versions: 1.21.80 – 1.26.60 */
		biome_id?: number | undefined;
		/** Temperature is the temperature of the biome, used for weather, biome behaviours and sky colour. Versions: 1.21.80 – 1.26.60 */
		temperature: number;
		/** Downfall is the amount that precipitation affects colours and block changes. Versions: 1.21.80 – 1.26.60 */
		downfall: number;
		/** Versions: 1.21.80 – 1.21.100 */
		red_spore_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		blue_spore_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		ash_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		white_ash_density?: number | undefined;
		/** Depth ... Versions: 1.21.80 – 1.26.60 */
		depth: number;
		/** Scale ... Versions: 1.21.80 – 1.26.60 */
		scale: number;
		/** MapWaterColour is an ARGB value for the water colour on maps in the biome. Versions: 1.21.80 – 1.26.60 */
		map_water_colour: number;
		/** Rain is true if the biome has rain, false if it is a dry biome. Versions: 1.21.80 – 1.26.60 */
		rain: boolean;
		/** Versions: 1.21.80 – 1.26.60 */
		tags?: number[] | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		chunk_generation?: BiomeChunkGeneration | undefined;
		/** Changes leaves turning white in snow Versions: 1.21.111 – 1.26.60 */
		snow_foliage?: number | undefined;
	};
	/**
	 * BiomeChunkGeneration represents the information required for the client to generate chunks itself
	 * to create the illusion of a larger render distance.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeChunkGeneration = {
		/** Versions: 1.21.80 – 1.26.60 */
		climate?: BiomeClimate | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		consolidated_features?: BiomeConsolidatedFeature[] | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		mountain_parameters?: BiomeMountainParameters | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		surface_material_adjustments?: BiomeElementData[] | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		surface_materials?: BiomeSurfaceMaterial | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		has_swamp_surface?: boolean | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		has_frozen_ocean_surface?: boolean | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		has_end_surface?: boolean | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		mesa_surface?: BiomeMesaSurface | undefined;
		/** Versions: 1.21.80 – 1.26.10 */
		capped_surface?: BiomeCappedSurface | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		overworld_rules?: BiomeOverworldRules | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		multi_noise_rules?: BiomeMultiNoiseRules | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		legacy_rules?: BiomeConditionalTransformation[] | undefined;
		/** Versions: 1.21.111 – 1.26.10 */
		has_default_overworld_surface?: boolean | undefined;
		/** Versions: 1.21.120 – 1.26.60 */
		replacements_data?: BiomeReplacementData[] | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		has_village_type?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		village_type?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		surface_builder_data?: BiomeSurfaceBuilder | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		sub_surface_builder_data?: BiomeSurfaceBuilder | undefined;
	};
	/**
	 * BiomeClimate represents the climate of a biome, mainly for ambience but also defines certain behaviours.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeClimate = {
		/** Temperature is the temperature of the biome, used for weather, biome behaviours and sky colour. Versions: 1.21.80 – 1.26.60 */
		temperature: number;
		/** Downfall is the amount that precipitation affects colours and block changes. Versions: 1.21.80 – 1.26.60 */
		downfall: number;
		/** Versions: 1.21.80 – 1.21.100 */
		red_spore_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		blue_spore_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		ash_density?: number | undefined;
		/** Versions: 1.21.80 – 1.21.100 */
		white_ash_density?: number | undefined;
		/** SnowAccumulationMin is the minimum amount of snow that can accumulate in the biome, every 0.125 is another layer of snow. Versions: 1.21.80 – 1.26.60 */
		snow_accumulation_min: number;
		/** SnowAccumulationMax is the maximum amount of snow that can accumulate in the biome, every 0.125 is another layer of snow. Versions: 1.21.80 – 1.26.60 */
		snow_accumulation_max: number;
	};
	/**
	 * BiomeMountainParameters specifies the parameters for a mountain biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeMountainParameters = {
		/** SteepBlock is the runtime ID of the block to use for steep slopes. Versions: 1.21.80 – 1.26.60 */
		steep_block: number;
		/** NorthSlopes is true if the biome has north slopes. Versions: 1.21.80 – 1.26.60 */
		north_slopes: boolean;
		/** SouthSlopes is true if the biome has south slopes. Versions: 1.21.80 – 1.26.60 */
		south_slopes: boolean;
		/** WestSlopes is true if the biome has west slopes. Versions: 1.21.80 – 1.26.60 */
		west_slopes: boolean;
		/** EastSlopes is true if the biome has east slopes. Versions: 1.21.80 – 1.26.60 */
		east_slopes: boolean;
		/** TopSlideEnabled is true if the biome has top slide enabled. Versions: 1.21.80 – 1.26.60 */
		top_slide_enabled: boolean;
	};
	/**
	 * BiomeSurfaceMaterial specifies the materials to use for the surface layers of the biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeSurfaceMaterial = {
		/** TopBlock is the runtime ID of the block to use for the top layer. Versions: 1.21.80 – 1.26.60 */
		top_block: number;
		/** MidBlock is the runtime ID to use for the middle layers. Versions: 1.21.80 – 1.26.60 */
		mid_block: number;
		/** SeaFloorBlock is the runtime ID to use for the sea floor. Versions: 1.21.80 – 1.26.60 */
		sea_floor_block: number;
		/** FoundationBlock is the runtime ID to use for the foundation layers. Versions: 1.21.80 – 1.26.60 */
		foundation_block: number;
		/** SeaBlock is the runtime ID to use for the sea layers. Versions: 1.21.80 – 1.26.60 */
		sea_block: number;
		/** SeaFloorDepth is the depth of the sea floor, in blocks. Versions: 1.21.80 – 1.26.60 */
		sea_floor_depth: number;
	};
	/**
	 * BiomeMesaSurface specifies the materials to use for the mesa biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeMesaSurface = {
		/** ClayMaterial is the runtime ID of the block to use for clay layers. Versions: 1.21.80 – 1.26.60 */
		clay_material: number;
		/** HardClayMaterial is the runtime ID of the block to use for hard clay layers. Versions: 1.21.80 – 1.26.60 */
		hard_clay_material: number;
		/** BrycePillars is true if the biome has bryce pillars, which are tall spire-like structures. Versions: 1.21.80 – 1.26.60 */
		bryce_pillars: boolean;
		/** HasForest is true if the biome has a forest. Versions: 1.21.80 – 1.26.60 */
		has_forest: boolean;
	};
	/**
	 * BiomeCappedSurface specifies the materials to use for the capped surface of a biome, such as in the Nether.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeCappedSurface = {
		/** FloorBlocks is a list of runtime IDs to use for the floor blocks. Versions: 1.21.80 – 1.26.60 */
		floor_blocks: number[];
		/** CeilingBlocks is a list of runtime IDs to use for the ceiling blocks. Versions: 1.21.80 – 1.26.60 */
		ceiling_blocks: number[];
		/** Versions: 1.21.80 – 1.26.60 */
		sea_block?: number | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		foundation_block?: number | undefined;
		/** Versions: 1.21.80 – 1.26.60 */
		beach_block?: number | undefined;
	};
	/**
	 * BiomeMultiNoiseRules specifies the rules for multi-noise biomes, which are biomes that are defined by
	 * multiple noise parameters instead of just temperature and humidity.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeMultiNoiseRules = {
		/** Temperature is the temperature level of the biome. Versions: 1.21.80 – 1.26.60 */
		temperature: number;
		/** Humidity is the humidity level of the biome. Versions: 1.21.80 – 1.26.60 */
		humidity: number;
		/** Altitude is the altitude level of the biome. Versions: 1.21.80 – 1.26.60 */
		altitude: number;
		/** Weirdness is the weirdness level of the biome. Versions: 1.21.80 – 1.26.60 */
		weirdness: number;
		/** Weight is the weight of the biome, with a higher weight being more likely to be selected. Versions: 1.21.80 – 1.26.60 */
		weight: number;
	};
	/**
	 * BiomeWeight defines the weight for a biome, used for weighted randomness.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeWeight = {
		/** Biome is the index of the biome name in the string list. Versions: 1.21.80 – 1.26.60 */
		biome: number;
		/** Weight is the weight of the biome, with a higher weight being more likely to be selected. Versions: 1.21.80 – 1.26.60 */
		weight: number;
	};
	/**
	 * BiomeTemperatureWeight defines the weight for a temperature, used for weighted randomness.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeTemperatureWeight = {
		/** Temperature is the temperature that can be selected. Versions: 1.21.80 – 1.26.60 */
		temperature: number;
		/** Weight is the weight of the temperature, with a higher weight being more likely to be selected. Versions: 1.21.80 – 1.26.60 */
		weight: number;
	};
	/**
	 * BiomeConsolidatedFeature represents a feature that is consolidated into a single feature for the biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeConsolidatedFeature = {
		/** Scatter defines how the feature is scattered in the biome. Versions: 1.21.80 – 1.26.60 */
		scatter: BiomeScatterParameter;
		/** Feature is the index of the feature's name in the string list. Versions: 1.21.80 – 1.26.60 */
		feature: number;
		/** Identifier is the index of the feature's identifier in the string list. Versions: 1.21.80 – 1.26.60 */
		identifier: number;
		/** Pass is the index of the feature's pass in the string list. Versions: 1.21.80 – 1.26.60 */
		pass: number;
		/** CanUseInternal is true if the feature can use internal features. Versions: 1.21.80 – 1.26.60 */
		can_use_internal: boolean;
	};
	/**
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeScatterParameter = {
		/** Coordinates is a list of coordinate rules to scatter the feature within. Versions: 1.21.80 – 1.26.60 */
		coordinates: BiomeCoordinate[];
		/** EvaluationOrder is the order in which the coordinates are evaluated. Versions: 1.21.80 – 1.26.60 */
		evaluation_order: "xyz" | "xzy" | "yxz" | "yzx" | "zxy" | "zyx" | number;
		/** ChancePercentType is the type of expression operation to use for the chance percent. Versions: 1.21.80 – 1.26.60 */
		chance_percent_type: number;
		/** ChancePercent is the index of the chance expression in the string list. Versions: 1.21.80 – 1.26.60 */
		chance_percent: number;
		/** ChanceNumerator is the numerator of the chance expression. Versions: 1.21.80 – 1.26.60 */
		chance_numerator: number;
		/** ChanceDenominator is the denominator of the chance expression. Versions: 1.21.80 – 1.26.60 */
		chance_denominator: number;
		/** IterationsType is the type of expression operation to use for the iterations. Versions: 1.21.80 – 1.26.60 */
		iterations_type: number;
		/** Iterations is the index of the iterations expression in the string list. Versions: 1.21.80 – 1.26.60 */
		iterations: number;
	};
	/**
	 * BiomeCoordinate specifies coordinate rules for where features can be scattered in the biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeCoordinate = {
		/** MinValueType is the type of expression operation to use for the minimum value. Versions: 1.21.80 – 1.26.60 */
		min_value_type: number;
		/** MinValue is the index of the minimum value expression in the string list. Versions: 1.21.80 – 1.26.60 */
		min_value: number;
		/** MaxValueType is the type of expression operation to use for the maximum value. Versions: 1.21.80 – 1.26.60 */
		max_value_type: number;
		/** MaxValue is the index of the maximum value expression in the string list. Versions: 1.21.80 – 1.26.60 */
		max_value: number;
		/** GridOffset is the offset of the grid, used for fixed grid and jittered grid distributions. Versions: 1.21.80 – 1.26.60 */
		grid_offset: number;
		/** GridStepSize is the step size of the grid, used for fixed grid and jittered grid distributions. Versions: 1.21.80 – 1.26.60 */
		grid_step_size: number;
		/** Distribution is the type of distribution to use for the coordinate. Versions: 1.21.80 – 1.26.60 */
		distribution: "single_valued" | "uniform" | "gaussian" | "inverse_gaussian" | "fixed_grid" | "jittered_grid" | "triangle" | number;
	};
	/**
	 * BiomeElementData are set rules to adjust the surface materials of the biome.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeElementData = {
		/** NoiseFrequencyScale is the frequency scale of the noise used to adjust the surface materials. Versions: 1.21.80 – 1.26.60 */
		noise_frequency_scale: number;
		/** NoiseLowerBound is the minimum noise value required to be selected. Versions: 1.21.80 – 1.26.60 */
		noise_lower_bound: number;
		/** NoiseUpperBound is the maximum noise value required to be selected. Versions: 1.21.80 – 1.26.60 */
		noise_upper_bound: number;
		/** HeightMinType is the type of expression operation to use for the minimum height. Versions: 1.21.80 – 1.26.60 */
		height_min_type: number;
		/** HeightMin is the index of the minimum height expression in the string list. Versions: 1.21.80 – 1.26.60 */
		height_min: number;
		/** HeightMaxType is the type of expression operation to use for the maximum height. Versions: 1.21.80 – 1.26.60 */
		height_max_type: number;
		/** HeightMax is the index of the maximum height expression in the string list. Versions: 1.21.80 – 1.26.60 */
		height_max: number;
		/** AdjustedMaterials is the materials to use for the surface layers of the biome if selected. Versions: 1.21.80 – 1.26.60 */
		adjusted_materials: BiomeSurfaceMaterial;
	};
	/**
	 * BiomeOverworldRules specifies a list of transformation rules to apply to different parts of the overworld.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeOverworldRules = {
		/** HillsTransformations is a list of weighted biome transformations to apply to hills. Versions: 1.21.80 – 1.26.60 */
		hills_transformations: BiomeWeight[];
		/** MutateTransformations is a list of weighted biome transformations to apply to mutated biomes. Versions: 1.21.80 – 1.26.60 */
		mutate_transformations: BiomeWeight[];
		/** RiverTransformations is a list of weighted biome transformations to apply to rivers. Versions: 1.21.80 – 1.26.60 */
		river_transformations: BiomeWeight[];
		/** ShoreTransformations is a list of weighted biome transformations to apply to shores. Versions: 1.21.80 – 1.26.60 */
		shore_transformations: BiomeWeight[];
		/** PreHillsEdgeTransformations is a list of conditional transformations to apply to the edges of hills. Versions: 1.21.80 – 1.26.60 */
		pre_hills_edge_transformations: BiomeConditionalTransformation[];
		/** PostShoreEdgeTransformations is a list of conditional transformations to apply to the edges of shores. Versions: 1.21.80 – 1.26.60 */
		post_shore_edge_transformations: BiomeConditionalTransformation[];
		/** ClimateTransformations is a list of weighted temperature transformations to apply to the biome's climate. Versions: 1.21.80 – 1.26.60 */
		climate_transformations: BiomeTemperatureWeight[];
	};
	/**
	 * BiomeConditionalTransformation is the legacy method of transforming biomes.
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type BiomeConditionalTransformation = {
		/** WeightedBiomes is a list of biomes and their weights. Versions: 1.21.80 – 1.26.60 */
		weighted_biomes: BiomeWeight[];
		/** ConditionJSON is an index of the condition JSON data in the string list. Versions: 1.21.80 – 1.26.60 */
		condition_json: number;
		/** MinPassingNeighbours is the minimum number of neighbours that must pass the condition for the transformation to be applied. Versions: 1.21.80 – 1.26.60 */
		min_passing_neighbours: number;
	};
	/**
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type packet_player_location = {
		/** Type is the action that is being performed. It is one of the constants above. Versions: 1.21.80 – 1.26.60 */
		type: "coordinates" | "type_hide" | number;
		/** As of 1.26.40 the target entity comes first and the type is an unsigned varint. Versions: 1.21.80 – 1.26.60 */
		entity_unique_id: bigint | number;
		/** Versions: 1.21.80 – 1.26.60 */
		position?: vec3f | undefined;
		/** Currently always zero. Versions: 1.26.40 – 1.26.60 */
		unused?: number | undefined;
	};
	/**
	 * Versions: 1.21.80 – 1.26.60
	 */
	export type packet_clientbound_controls_scheme = {
		/** Scheme is the scheme that the client should use. It is one of the constants above. Versions: 1.21.80 – 1.26.60 */
		scheme: "locked_player_relative_strafe" | "camera_relative" | "camera_relative_strafe" | "player_relative" | "player_relative_strafe" | number;
	};
	/**
	 * Versions: 1.21.90 – 1.26.60
	 */
	export type HeightMapDataType = "no_data" | "has_data" | "too_high" | "too_low" | "all_copied" | number;
	/**
	 * ServerScriptDebugDrawer instructs the client to render debug shapes for development visualisations.
	 * Versions: 1.21.90 – 1.26.60
	 */
	export type packet_server_script_debug_drawer = {
		/** Versions: 1.21.90 – 1.26.60 */
		shapes: {
			network_id: bigint | number;
			shape_type?: "line" | "box" | "sphere" | "circle" | "text" | "arrow" | number | undefined;
			location?: vec3f | undefined;
			scale?: number | undefined;
			rotation?: vec3f | undefined;
			time_left?: number | undefined;
			color?: number | undefined;
			text?: string | undefined;
			box_bound?: vec3f | undefined;
			line_end_location?: vec3f | undefined;
			arrow_head_length?: number | undefined;
			arrow_head_radius?: number | undefined;
			segment_count?: number | undefined;
		}[];
	};
	/**
	 * Versions: 1.21.100 – 1.26.60
	 */
	export type EaseType = "Linear" | "Spring" | "InQuad" | "OutQuad" | "InOutQuad" | "InCubic" | "OutCubic" | "InOutCubic" | "InQuart" | "OutQuart" | "InOutQuart" | "InQuint" | "OutQuint" | "InOutQuint" | "InSine" | "OutSine" | "InOutSine" | "InExpo" | "OutExpo" | "InOutExpo" | "InCirc" | "OutCirc" | "InOutCirc" | "InBounce" | "OutBounce" | "InOutBounce" | "InBack" | "OutBack" | "InOutBack" | "InElastic" | "OutElastic" | "InOutElastic" | number | "InverseLerp";
	/**
	 * Versions: 1.21.111 – 1.26.60
	 */
	export type GameRuleI32 = {
		/** Versions: 1.21.111 – 1.26.60 */
		name: string;
		/** Versions: 1.21.111 – 1.26.60 */
		editable: boolean;
		/** Versions: 1.21.111 – 1.26.60 */
		type: "bool" | "int" | "float" | number;
		/** Versions: 1.21.111 – 1.26.60 */
		value?: boolean | number | undefined;
	};
	/**
	 * Versions: 1.21.111 – 1.26.60
	 */
	export type GameRuleVarint = {
		/** Versions: 1.21.111 – 1.26.60 */
		name: string;
		/** Versions: 1.21.111 – 1.26.60 */
		editable: boolean;
		/** Versions: 1.21.111 – 1.26.60 */
		type: "bool" | "int" | "float" | number;
		/** Versions: 1.21.111 – 1.26.60 */
		value?: boolean | number | undefined;
	};
	/**
	 * Versions: 1.21.111 – 1.26.60
	 */
	export type ArmorDamageEntry = {
		/** Versions: 1.21.111 – 1.26.60 */
		armor_slot: "helmet" | "chestplate" | "leggings" | "boots" | "body" | number;
		/** Versions: 1.21.111 – 1.26.60 */
		damage: number;
	};
	/**
	 * ServerBoundPackSettingChange
	 * Versions: 1.21.111 – 1.26.60
	 */
	export type packet_serverbound_pack_setting_change = {
		/** Versions: 1.21.111 – 1.26.60 */
		pack_id: string;
		/** Versions: 1.21.111 – 1.26.60 */
		pack_setting: {
			name: string;
			type: "float" | "bool" | "string" | number | "string_list";
			value?: number | boolean | string | string[] | undefined;
		};
	};
	/**
	 * CameraRotationOption represents a rotation keyframe option for spline instructions.
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type CameraRotationOption = {
		/** Value is the rotation value for the keyframe. Versions: 1.21.120 – 1.26.60 */
		value: vec3f;
		/** Time is the time of the keyframe within the spline. Versions: 1.21.120 – 1.26.60 */
		time: number;
		/** Versions: 1.26.0 – 1.26.60 */
		has_ease_type?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		ease_type?: number | string | undefined;
	};
	/**
	 * CameraSplineInstruction represents a camera spline instruction definition.
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type CameraSplineInstruction = {
		/** TotalTime is the total time for the spline animation. Versions: 1.21.120 – 1.26.60 */
		total_time: number;
		/** Versions: 1.21.120 – 1.21.130 */
		ease_type?: CameraSplineEaseType | undefined;
		/** Curve is the list of curve points defining the spline. Versions: 1.21.120 – 1.26.60 */
		curve: vec3f[];
		/** ProgressKeyFrames is a list of key frames for the spline progress. Versions: 1.21.120 – 1.26.60 */
		progress_key_frames: vec2f[] | CameraProgressOption[];
		/** RotationOptions is a list of rotation keyframes for the spline. Versions: 1.21.120 – 1.26.60 */
		rotation_options: CameraRotationOption[];
		/** Versions: 1.26.0 – 1.26.60 */
		has_spline_type?: boolean | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		spline_type?: number | string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		spline_identifier?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		load_from_json?: boolean | undefined;
	};
	/**
	 * BiomeReplacementData represents data for biome replacements.
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type BiomeReplacementData = {
		/** Biome is the biome ID to replace. Versions: 1.21.120 – 1.26.60 */
		biome: number;
		/** Dimension is the dimension ID where the replacement applies. Versions: 1.21.120 – 1.26.60 */
		dimension: number;
		/** TargetBiomes is a list of target biome IDs for the replacement. Versions: 1.21.120 – 1.26.60 */
		target_biomes: number[];
		/** Amount is the amount of replacement to apply. Versions: 1.21.120 – 1.26.60 */
		amount: number;
		/** NoiseFrequencyScale is the noise frequency scale to use for replacement selection. Versions: 1.21.120 – 1.26.60 */
		noise_frequency_scale: number;
		/** ReplacementIndex is the index of the replacement. Versions: 1.21.120 – 1.26.60 */
		replacement_index: number;
	};
	/**
	 * Versions: 1.21.120 – 1.26.0
	 */
	export type CameraSplineEaseType = "catmull_rom" | "linear" | number;
	/**
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type ParameterKeyframeValue = {
		/** Time is the time of the keyframe. Versions: 1.21.120 – 1.26.60 */
		time: number;
		/** Value is the value at the keyframe. Versions: 1.21.120 – 1.26.60 */
		value: vec3f;
	};
	/**
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type GraphicsOverrideParameterType = "sky_zenith_color" | number | "sky_horizon_color" | "horizon_blend_min" | "horizon_blend_max" | "horizon_blend_start" | "horizon_blend_mie_start" | "rayleigh_strength" | "sun_mie_strength" | "moon_mie_strength" | "sun_glare_shape" | "chlorophyll" | "cdom" | "suspended_sediment" | "waves_depth" | "waves_frequency" | "waves_frequency_scaling" | "waves_speed" | "waves_speed_scaling" | "waves_shape" | "waves_octaves" | "waves_mix" | "waves_pull" | "waves_direction_increment" | "midtones_contrast" | "highlights_contrast" | "shadows_contrast" | "highlights_gain" | "highlights_gamma" | "highlights_offset" | "highlights_saturation" | "midtones_gain" | "midtones_gamma" | "midtones_offset" | "midtones_saturation" | "shadows_gain" | "shadows_gamma" | "shadows_offset" | "shadows_saturation" | "highlights_min" | "shadows_max" | "temperature" | "sun_color" | "sun_illuminance" | "moon_color" | "moon_illuminance" | "flash_color" | "flash_illuminance" | "ambient_color" | "ambient_illuminance" | "emissive_desaturation" | "sky_intensity" | "orbital_offset_degrees";
	/**
	 * Versions: 1.21.120 – 1.26.60
	 */
	export type packet_graphics_override_parameter = {
		/** Versions: 1.21.120 – 1.26.60 */
		values: ParameterKeyframeValue[];
		/** Versions: 1.21.120 – 1.26.60 */
		biome_identifier: string;
		/** Versions: 1.21.120 – 1.26.60 */
		parameter_type: GraphicsOverrideParameterType;
		/** Versions: 1.21.120 – 1.26.60 */
		reset: boolean;
		/** Versions: 1.26.0 – 1.26.60 */
		float_value?: number | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		vec3_value?: vec3f | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		player_id?: string | undefined;
	};
	/**
	 * Versions: 1.21.130 – 1.26.60
	 */
	export type DebugMarkerData = {
		/** Versions: 1.21.130 – 1.26.60 */
		text: string;
		/** Versions: 1.21.130 – 1.26.60 */
		position: vec3f;
		/** Versions: 1.21.130 – 1.26.60 */
		color: number;
		/** Versions: 1.21.130 – 1.26.60 */
		duration: Int64Write;
	};
	/**
	 * Versions: 1.21.130 – 1.26.60
	 */
	export type packet_clientbound_data_store = {
		/** Versions: 1.21.130 – 1.26.0 */
		entries?: {
			type: "update" | "change" | "removal" | number;
			name?: string | undefined;
			property?: string | undefined;
			path?: string | undefined;
			data_type?: "double" | "bool" | "string" | number | undefined;
			data?: number | boolean | string | undefined;
			update_count?: number | undefined;
			path_update_count?: number | undefined;
		}[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		updates?: DataStoreChangeEntry[] | undefined;
	};
	/**
	 * Versions: 1.21.130 – 1.26.60
	 */
	export type packet_serverbound_data_store = {
		/** Versions: 1.21.130 – 1.26.60 */
		name: string;
		/** Versions: 1.21.130 – 1.26.60 */
		property: string;
		/** Versions: 1.21.130 – 1.26.60 */
		path: string;
		/** Versions: 1.21.130 – 1.26.60 */
		data_type: "double" | "bool" | "string" | number;
		/** Versions: 1.21.130 – 1.26.60 */
		data?: number | boolean | string | undefined;
		/** Versions: 1.21.130 – 1.26.60 */
		update_count: number;
		/** Versions: 1.26.0 – 1.26.60 */
		path_update_count?: number | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type CameraProgressOption = {
		/** Versions: 1.26.0 – 1.26.60 */
		value: number;
		/** Versions: 1.26.0 – 1.26.60 */
		time: number;
		/** Versions: 1.26.0 – 1.26.60 */
		has_ease_type: boolean;
		/** Versions: 1.26.0 – 1.26.60 */
		ease_type?: number | string | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type CameraSplineDefinition = {
		/** Versions: 1.26.0 – 1.26.60 */
		name: string;
		/** Versions: 1.26.0 */
		instruction?: CameraSplineInstruction | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		total_time?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		spline_type?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		control_points?: vec3f[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		progress_key_frames?: CameraProgressOption[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		rotation_key_frames?: CameraRotationOption[] | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type CameraAimAssistActorPriorityData = {
		/** Versions: 1.26.0 – 1.26.60 */
		preset_index: number;
		/** Versions: 1.26.0 – 1.26.60 */
		category_index: number;
		/** Versions: 1.26.0 – 1.26.60 */
		actor_index: number;
		/** Versions: 1.26.0 – 1.26.60 */
		priority: number;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type MemoryCategoryCounter = {
		/** Versions: 1.26.0 – 1.26.60 */
		category: "unknown" | "invalid_size_unknown" | "actor" | "actor_animation" | "actor_rendering" | "balancer" | "block_ticking_queues" | "biome_storage" | "cereal" | "circuit_system" | "client" | "commands" | "db_storage" | "debug" | "documentation" | "ecs_systems" | "fmod" | "fonts" | "im_gui" | "input" | "json_ui" | "json_ui_control_factory_json" | "json_ui_control_tree" | "json_ui_control_tree_control_element" | "json_ui_control_tree_populate_data_binding" | "json_ui_control_tree_populate_focus" | "json_ui_control_tree_populate_layout" | "json_ui_control_tree_populate_other" | "json_ui_control_tree_populate_sprite" | "json_ui_control_tree_populate_text" | "json_ui_control_tree_populate_tts" | "json_ui_control_tree_visibility" | "json_ui_create_ui" | "json_ui_defs" | "json_ui_layout_manager" | "json_ui_layout_manager_remove_dependencies" | "json_ui_layout_manager_init_variable" | "languages" | "level" | "level_structures" | "level_chunk" | "level_chunk_gen" | "level_chunk_gen_thread_local" | "network" | "marketplace" | "material_dragon_compiled_definition" | "material_dragon_material" | "material_dragon_resource" | "material_dragon_uniform_map" | "material_render_material" | "material_render_material_group" | "material_variation_manager" | "molang" | "ore_ui" | "persona" | "player" | "render_chunk" | "render_chunk_index_buffer" | "render_chunk_vertex_buffer" | "rendering" | "rendering_library" | "request_log" | "resource_packs" | "sound" | "sub_chunk_biome_data" | "sub_chunk_block_data" | "sub_chunk_light_data" | "textures" | "vr" | "weather_renderer" | "world_generator" | "tasks" | "test" | "scripting" | "scripting_runtime" | "scripting_context" | "scripting_context_bindings_mc" | "scripting_context_bindings_gt" | "scripting_context_run" | "data_driven_ui" | "data_driven_ui_defs" | number | "light_volume_manager" | "gameface" | "gameface_system" | "gameface_dom" | "gameface_css" | "gameface_display" | "gameface_temp_allocator" | "gameface_pool_allocator" | "gameface_dump" | "gameface_media" | "gameface_json" | "gameface_script_engine" | "blobs" | "ore_ui_client" | "persona_pieces" | "persona_animations" | "persona_characters" | "persona_skin_packs" | "persona_repo" | "rendering_bgfx_init" | "rendering_bgfx_start_frame" | "rendering_block_tessellator" | "rendering_end_frame" | "rendering_graphics_tasks_init" | "rendering_polygon_operator_pool" | "rendering_pbr_texture_data" | "rendering_render_registry" | "rendering_setup" | "rendering_vertices" | "test_load_test_tags" | "gameface_script" | "gameface_layout" | "executable";
		/** Versions: 1.26.0 – 1.26.60 */
		bytes: Int64Write;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type VoxelCells = {
		/** Versions: 1.26.0 – 1.26.60 */
		x_size: number;
		/** Versions: 1.26.0 – 1.26.60 */
		y_size: number;
		/** Versions: 1.26.0 – 1.26.60 */
		z_size: number;
		/** Versions: 1.26.0 – 1.26.60 */
		storage: number[];
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type VoxelShape = {
		/** Versions: 1.26.0 – 1.26.60 */
		cells: VoxelCells;
		/** Versions: 1.26.0 – 1.26.60 */
		x_coordinates: number[];
		/** Versions: 1.26.0 – 1.26.60 */
		y_coordinates: number[];
		/** Versions: 1.26.0 – 1.26.60 */
		z_coordinates: number[];
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type VoxelShapeNameEntry = {
		/** Versions: 1.26.0 – 1.26.60 */
		name: string;
		/** Versions: 1.26.0 – 1.26.60 */
		id: number;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type GatheringJoinInfo = {
		/** Versions: 1.26.0 – 1.26.60 */
		experience_id: string;
		/** Versions: 1.26.0 – 1.26.60 */
		experience_name: string;
		/** Versions: 1.26.0 – 1.26.60 */
		experience_world_id?: string | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		experience_world_name?: string | undefined;
		/** Versions: 1.26.0 – 1.26.60 */
		creator_id: string;
		/** Versions: 1.26.0 */
		store_id?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		target_id?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		scenario_id?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		server_id?: string | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type ServerJoinInformation = {
		/** Versions: 1.26.0 – 1.26.60 */
		has_gathering_info: boolean;
		/** Versions: 1.26.0 – 1.26.60 */
		gathering_info?: GatheringJoinInfo | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		store_entry_point_info?: StoreEntryPointInfo | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		presence_info?: PresenceInfo | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_clientbound_data_driven_ui_show_screen = {
		/** Versions: 1.26.0 – 1.26.60 */
		screen_id: string;
		/** Versions: 1.26.10 – 1.26.60 */
		form_id?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		data_instance_id?: number | undefined;
	};
	/**
	 * Versions: 1.26.0
	 */
	export type packet_clientbound_data_driven_ui_close_all_screens = Record<string, never>;
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_clientbound_data_driven_ui_reload = Record<string, never>;
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_clientbound_texture_shift = {
		/** Versions: 1.26.0 – 1.26.60 */
		action: "invalid" | "initialize" | "start" | "set_enabled" | "sync" | number;
		/** Versions: 1.26.0 – 1.26.60 */
		collection_name: string;
		/** Versions: 1.26.0 – 1.26.60 */
		from_step: string;
		/** Versions: 1.26.0 – 1.26.60 */
		to_step: string;
		/** Versions: 1.26.0 – 1.26.60 */
		all_steps: string[];
		/** Versions: 1.26.0 – 1.26.60 */
		current_length_ticks: bigint | number;
		/** Versions: 1.26.0 – 1.26.60 */
		total_length_ticks: bigint | number;
		/** Versions: 1.26.0 – 1.26.60 */
		enabled: boolean;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_voxel_shapes = {
		/** Versions: 1.26.0 – 1.26.60 */
		shapes: VoxelShape[];
		/** Versions: 1.26.0 – 1.26.60 */
		name_map: VoxelShapeNameEntry[];
		/** Versions: 1.26.10 – 1.26.60 */
		custom_shape_count?: number | undefined;
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_camera_spline = {
		/** Versions: 1.26.0 – 1.26.60 */
		splines: CameraSplineDefinition[];
	};
	/**
	 * Versions: 1.26.0 – 1.26.60
	 */
	export type packet_camera_aim_assist_actor_priority = {
		/** Versions: 1.26.0 – 1.26.60 */
		priority_data: CameraAimAssistActorPriorityData[];
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type StoreEntryPointInfo = {
		/** Versions: 1.26.10 – 1.26.60 */
		store_id: string;
		/** Versions: 1.26.10 – 1.26.60 */
		store_name: string;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type PresenceInfo = {
		/** Versions: 1.26.10 – 1.26.60 */
		experience_name?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		world_name?: string | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		rich_presence_id?: string | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type DataStorePropertyValue = {
		/** Versions: 1.26.10 – 1.26.60 */
		type: "none" | "bool" | "int64" | "string" | "map" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		value?: boolean | Int64Write | string | DataStoreMapEntry[] | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type DataStoreMapEntry = {
		/** Versions: 1.26.10 – 1.26.60 */
		key: string;
		/** Versions: 1.26.10 – 1.26.60 */
		value: DataStorePropertyValue;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type DataStoreChangeEntry = {
		/** Versions: 1.26.10 – 1.26.60 */
		change_type: "update" | "change" | "removal" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		property?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		path?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		data_type?: "double" | "bool" | "string" | number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		data?: number | boolean | string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		update_count?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		path_update_count?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		new_value?: DataStorePropertyValue | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type WaypointWorldPosition = {
		/** Versions: 1.26.10 – 1.26.60 */
		position: vec3f;
		/** Versions: 1.26.10 – 1.26.60 */
		dimension_id: number;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type Waypoint = {
		/** Versions: 1.26.10 – 1.26.60 */
		update_flags: number;
		/** Versions: 1.26.10 – 1.26.60 */
		visible?: boolean | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		world_position?: WaypointWorldPosition | undefined;
		/** Versions: 1.26.10 */
		texture_id?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		color?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		client_position_authority?: boolean | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		actor_unique_id?: bigint | number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		texture_path?: string | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		icon_size?: vec2f | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type LocatorBarWaypoint = {
		/** Versions: 1.26.10 – 1.26.60 */
		group_handle: string;
		/** Versions: 1.26.10 – 1.26.60 */
		waypoint: Waypoint;
		/** Versions: 1.26.10 – 1.26.60 */
		action: "none" | "add" | "remove" | "update" | number;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type SyncWorldClockStateData = {
		/** Versions: 1.26.10 – 1.26.60 */
		clock_id: bigint | number;
		/** Versions: 1.26.10 – 1.26.60 */
		time: number;
		/** Versions: 1.26.10 – 1.26.60 */
		paused: boolean;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type TimeMarkerData = {
		/** Versions: 1.26.10 – 1.26.60 */
		id: bigint | number;
		/** Versions: 1.26.10 – 1.26.60 */
		name: string;
		/** Versions: 1.26.10 – 1.26.60 */
		time: number;
		/** Versions: 1.26.10 – 1.26.60 */
		period?: number | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type WorldClockData = {
		/** Versions: 1.26.10 – 1.26.60 */
		id: bigint | number;
		/** Versions: 1.26.10 – 1.26.60 */
		name: string;
		/** Versions: 1.26.10 – 1.26.60 */
		time: number;
		/** Versions: 1.26.10 – 1.26.60 */
		paused: boolean;
		/** Versions: 1.26.10 – 1.26.60 */
		time_markers: TimeMarkerData[];
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type AttributeLayerSettings = {
		/** Versions: 1.26.10 – 1.26.60 */
		priority: number;
		/** Versions: 1.26.10 – 1.26.60 */
		weight_type: "float" | "string" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		float_weight?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		string_weight?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		enabled: boolean;
		/** Versions: 1.26.10 – 1.26.60 */
		transitions_paused: boolean;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type AttributeData = {
		/** Versions: 1.26.10 – 1.26.60 */
		type: "bool" | "float" | "colour" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		bool_value?: boolean | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		bool_operation?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		float_value?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		float_operation?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		float_constraint_min?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		float_constraint_max?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		colour_value?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		colour_operation?: number | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type EnvironmentAttributeData = {
		/** Versions: 1.26.10 – 1.26.60 */
		attribute_name: string;
		/** Versions: 1.26.10 – 1.26.60 */
		from_attribute?: AttributeData | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		attribute?: AttributeData | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		to_attribute?: AttributeData | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		current_transition_ticks?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		total_transition_ticks?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		ease_type?: number | EaseType | undefined;
		/** Versions: 1.26.30 – 1.26.60 */
		local_transition_ticks?: number | undefined;
		/** Versions: 1.26.30 – 1.26.51 */
		noise_transition?: boolean | undefined;
		/** Versions: 1.26.60 */
		payload_type?: "constant" | "transition" | "noise_transition" | number | undefined;
		/** Versions: 1.26.60 */
		clock_name?: string | undefined;
		/** Versions: 1.26.60 */
		noise_name?: string | undefined;
		/** Versions: 1.26.60 */
		noise_alignment?: {
			type: "min_local_transition_end" | number;
			value: number;
		} | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type AttributeLayerData = {
		/** Versions: 1.26.10 – 1.26.60 */
		name: string;
		/** Versions: 1.26.10 – 1.26.60 */
		dimension_id: number;
		/** Versions: 1.26.10 – 1.26.60 */
		settings: AttributeLayerSettings;
		/** Versions: 1.26.10 – 1.26.60 */
		environment_attributes: EnvironmentAttributeData[];
		/** Versions: 1.26.30 – 1.26.51 */
		noise_name?: string | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_clientbound_data_driven_ui_close_screen = {
		/** Versions: 1.26.10 – 1.26.60 */
		form_id?: number | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_resource_packs_ready_for_validation = Record<string, never>;
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_locator_bar = {
		/** Versions: 1.26.10 – 1.26.60 */
		waypoints: LocatorBarWaypoint[];
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_party_changed = {
		/** Versions: 1.26.10 */
		party_id?: string | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		party_info?: PartyInfo | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_serverbound_data_driven_screen_closed = {
		/** Versions: 1.26.10 – 1.26.60 */
		form_id?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		close_reason: "programmatic_close" | "programmatic_close_all" | "client_canceled" | "user_busy" | "invalid_form" | number | string;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_sync_world_clocks = {
		/** Versions: 1.26.10 – 1.26.60 */
		payload_type: "sync_state" | "initialize_registry" | "add_time_marker" | "remove_time_marker" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		sync_states?: SyncWorldClockStateData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		clocks?: WorldClockData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		add_clock_id?: bigint | number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		add_time_markers?: TimeMarkerData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		remove_clock_id?: bigint | number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		remove_time_marker_ids?: bigint | number[] | undefined;
	};
	/**
	 * Versions: 1.26.10 – 1.26.60
	 */
	export type packet_clientbound_attribute_layer_sync = {
		/** Versions: 1.26.10 – 1.26.60 */
		payload_type: "update_layers" | "update_settings" | "update_environment" | "remove_environment" | number;
		/** Versions: 1.26.10 – 1.26.60 */
		layers?: AttributeLayerData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		layer_name?: string | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		dimension_id?: number | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		settings?: AttributeLayerSettings | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		environment_attributes?: EnvironmentAttributeData[] | undefined;
		/** Versions: 1.26.10 – 1.26.60 */
		remove_attribute_names?: string[] | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.30
	 */
	export type ItemV4NetIdVariant = {
		/** Versions: 1.26.20 – 1.26.30 */
		type: "item_stack_net_id" | "item_stack_request_id" | "item_stack_legacy_request_id" | number;
		/** Versions: 1.26.20 – 1.26.30 */
		id: number;
	};
	/**
	 * As of 1.26.40 the standalone `Item` encoding is gone: everything that used it now uses `ItemV4`.
	 * As of 1.26.40 the net ID is a plain zigzag32 again; the oneOf variant tag that preceded it is gone.
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ItemV4 = {
		/** Versions: 1.26.20 – 1.26.60 */
		network_id: number;
		/** Versions: 1.26.20 – 1.26.60 */
		count: number;
		/** Versions: 1.26.20 – 1.26.60 */
		metadata: number;
		/** Versions: 1.26.20 – 1.26.60 */
		has_stack_id: boolean;
		/** Versions: 1.26.20 – 1.26.60 */
		stack_id?: ItemV4NetIdVariant | number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		block_runtime_id: number;
		/** Versions: 1.26.20 – 1.26.60 */
		extra?: ItemExtraDataWithBlockingTick | ItemExtraDataWithoutBlockingTick | undefined;
	};
	/**
	 * BiomeSurfaceBuilder describes how one layer of a biome's surface is generated.
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type BiomeSurfaceBuilder = {
		/** Versions: 1.26.20 – 1.26.60 */
		surface_materials?: BiomeSurfaceMaterial | undefined;
		/** HasDefaultOverworldSurface is true if the biome has a default overworld surface. Versions: 1.26.20 – 1.26.60 */
		has_default_overworld_surface: boolean;
		/** HasSwampSurface is true if the biome has a swamp surface. Versions: 1.26.20 – 1.26.60 */
		has_swamp_surface: boolean;
		/** HasFrozenOceanSurface is true if the biome has a frozen ocean surface. Versions: 1.26.20 – 1.26.60 */
		has_frozen_ocean_surface: boolean;
		/** HasEndSurface is true if the biome has an end surface. Versions: 1.26.20 – 1.26.60 */
		has_end_surface: boolean;
		/** Versions: 1.26.20 – 1.26.60 */
		mesa_surface?: BiomeMesaSurface | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		capped_surface?: BiomeCappedSurface | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		noise_gradient_surface?: BiomeNoiseGradientSurface | undefined;
	};
	/**
	 * BiomeNoiseGradientSurface generates a surface by sampling a named noise function.
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type BiomeNoiseGradientSurface = {
		/** Versions: 1.26.20 – 1.26.60 */
		non_replaceable_blocks: number[];
		/** Versions: 1.26.20 – 1.26.60 */
		gradient_blocks: number[] | BiomeNoiseBlockSpecifier[];
		/** Versions: 1.26.20 – 1.26.60 */
		noise_seed: string;
		/** Versions: 1.26.20 – 1.26.60 */
		first_octave: number;
		/** Versions: 1.26.20 – 1.26.60 */
		amplitudes: number[];
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type EntityDiagnosticTimingInfo = {
		/** Versions: 1.26.20 – 1.26.60 */
		display_name: string;
		/** Versions: 1.26.20 – 1.26.60 */
		entity: string;
		/** Versions: 1.26.20 – 1.26.60 */
		duration_nanos: Int64Write;
		/** Versions: 1.26.20 – 1.26.60 */
		percent_of_total: number;
		/** Versions: 1.26.51 – 1.26.60 */
		position?: vec3f | undefined;
		/** Versions: 1.26.51 – 1.26.60 */
		dimension?: string | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type SystemDiagnosticTimingInfo = {
		/** Versions: 1.26.20 – 1.26.60 */
		display_name: string;
		/** Versions: 1.26.20 – 1.26.60 */
		system_index: Int64Write;
		/** Versions: 1.26.20 – 1.26.60 */
		duration_nanos: Int64Write;
		/** Versions: 1.26.20 – 1.26.60 */
		percent_of_total: number;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type PrimitiveShape = {
		/** Versions: 1.26.20 – 1.26.60 */
		network_id: bigint | number;
		/** Versions: 1.26.20 – 1.26.60 */
		type?: "line" | "box" | "sphere" | "circle" | "text" | "arrow" | number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		location?: vec3f | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		scale?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		rotation?: vec3f | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		total_time_left?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		max_render_distance?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		color?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		dimension_id?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		attached_to_entity_id?: bigint | number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		extra_shape_data?: ShapeLine | ShapeBox | ShapeSphere | ShapeCircle | ShapeText | ShapeArrow | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeLine = {
		/** Versions: 1.26.20 – 1.26.60 */
		end_location: vec3f;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeBox = {
		/** Versions: 1.26.20 – 1.26.60 */
		box_bound: vec3f;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeSphere = {
		/** Versions: 1.26.20 – 1.26.60 */
		segment_count?: number | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeCircle = {
		/** Versions: 1.26.20 – 1.26.60 */
		segment_count?: number | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeText = {
		/** Versions: 1.26.20 – 1.26.60 */
		text: string;
		/** Versions: 1.26.20 – 1.26.60 */
		use_rotation?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		background_color?: number | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		depth_test?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		show_backface?: boolean | undefined;
		/** Versions: 1.26.20 – 1.26.60 */
		show_backface_text?: boolean | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type ShapeArrow = {
		/** Versions: 1.26.20 – 1.26.60 */
		end_location: vec3f;
		/** Versions: 1.26.20 – 1.26.60 */
		arrow_head_length: number;
		/** Versions: 1.26.20 – 1.26.60 */
		arrow_head_radius: number;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type PartyInfo = {
		/** Versions: 1.26.20 – 1.26.60 */
		party_id: string;
		/** Versions: 1.26.20 – 1.26.60 */
		party_leader: boolean;
	};
	/**
	 * PrimitiveShapes is a packet sent by the server to instruct the client to render one or more shapes in the world.
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type packet_primitive_shapes = {
		/** Versions: 1.26.20 – 1.26.60 */
		shapes: PrimitiveShape[];
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type packet_server_store_info = {
		/** Versions: 1.26.20 – 1.26.60 */
		store_info?: StoreEntryPointInfo | undefined;
	};
	/**
	 * Versions: 1.26.20 – 1.26.60
	 */
	export type packet_server_presence_info = {
		/** Versions: 1.26.20 – 1.26.60 */
		presence_info?: PresenceInfo | undefined;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type ItemV4s = ItemV4[];
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type vec3i8 = {
		/** Versions: 1.26.30 – 1.26.60 */
		x: number;
		/** Versions: 1.26.30 – 1.26.60 */
		y: number;
		/** Versions: 1.26.30 – 1.26.60 */
		z: number;
	};
	/**
	 * Versions: 1.26.30
	 */
	export type TransactionActionsAuthInput = {
		source_type: "container" | "global" | "world_interaction" | "creative" | "craft_slot" | "craft" | number;
		inventory_id?: WindowIDZigzag32 | undefined;
		action?: number | undefined;
		flags?: number | undefined;
		slot: number;
		old_item: Item;
		new_item: Item;
	}[];
	/**
	 * Versions: 1.26.30
	 */
	export type TransactionLegacyAuthInput = {
		/** Versions: 1.26.30 */
		legacy_request_id: number;
		/** Versions: 1.26.30 */
		legacy_transactions?: {
			container_id: number;
			changed_slots: {
				slot_id: number;
			}[];
		}[] | undefined;
	};
	/**
	 * As of 1.26.30, sounds are now sent as strings with their registry name
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type ServerSoundHandle = Int64Write;
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type SoundEventIdentifier = string;
	/**
	 * BiomeNoiseBlockSpecifier picks a block based on where a noise sample falls in a range. As of 1.26.30 this
	 * replaced the plain block runtime id previously used for `gradient_blocks`.
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type BiomeNoiseBlockSpecifier = {
		/** Versions: 1.26.30 – 1.26.60 */
		noise: string;
		/** Versions: 1.26.30 – 1.26.60 */
		threshold: number;
		/** Versions: 1.26.30 – 1.26.60 */
		min: number;
		/** Versions: 1.26.30 – 1.26.60 */
		max: number;
		/** Versions: 1.26.30 – 1.26.60 */
		block: number;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type WhiskerScopeDataSummary = {
		/** Versions: 1.26.30 – 1.26.60 */
		label: string;
		/** Versions: 1.26.30 – 1.26.60 */
		indentation: string;
		/** Versions: 1.26.30 – 1.26.60 */
		total_high_cost_ns: Int64Write;
		/** Versions: 1.26.30 – 1.26.60 */
		total_mid_cost_ns: Int64Write;
		/** Versions: 1.26.30 – 1.26.60 */
		total_low_cost_ns: Int64Write;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type packet_clientbound_update_sound_data = {
		/** Versions: 1.26.30 – 1.26.60 */
		server_sound_handle: ServerSoundHandle;
		/** Versions: 1.26.30 */
		sound_event?: string | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		stop?: {
			unused: number;
		} | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		volume?: {
			unused: number;
			volume: number;
		} | number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		pitch?: {
			unused: number;
			pitch: number;
		} | number | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		fade?: {
			unused: number;
			target_volume: number;
			duration: number;
		} | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		seek_to?: {
			unused: number;
			seconds: number;
		} | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		pause?: {
			unused: number;
		} | undefined;
		/** Versions: 1.26.40 – 1.26.51 */
		resume?: {
			unused: number;
		} | undefined;
		/** Versions: 1.26.60 */
		type?: "stop" | "set_volume" | "set_pitch" | "fade" | "seek_to" | "pause" | "resume" | number | undefined;
		/** Versions: 1.26.60 */
		duration?: number | undefined;
		/** Versions: 1.26.60 */
		target_volume?: number | undefined;
		/** Versions: 1.26.60 */
		seconds?: number | undefined;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type packet_send_party_destination_cookie = {
		/** Versions: 1.26.30 – 1.26.60 */
		cookie: string;
		/** Versions: 1.26.30 – 1.26.60 */
		intent: string;
		/** Versions: 1.26.30 – 1.26.60 */
		destination_name: string;
	};
	/**
	 * Versions: 1.26.30 – 1.26.60
	 */
	export type packet_party_destination_cookie_response = {
		/** Versions: 1.26.30 – 1.26.60 */
		cookie: string;
		/** Versions: 1.26.30 – 1.26.60 */
		accepted: boolean;
	};
	/**
	 * As of 1.26.40 each recipe kind is sent in its own array in packet_crafting_data, so the recipe type
	 * tag that used to prefix every entry is gone.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type ShapedRecipe = {
		/** Versions: 1.26.40 – 1.26.60 */
		recipe_id: LatinString;
		/** Versions: 1.26.40 – 1.26.60 */
		width: number;
		/** Versions: 1.26.40 – 1.26.60 */
		height: number;
		/** Flat input array, size of width*height Versions: 1.26.40 – 1.26.60 */
		input: RecipeIngredient[];
		/** Versions: 1.26.40 – 1.26.60 */
		output: ItemLegacy[];
		/** Versions: 1.26.40 – 1.26.60 */
		uuid: string;
		/** Versions: 1.26.40 – 1.26.60 */
		block: string;
		/** Versions: 1.26.40 – 1.26.60 */
		priority: number;
		/** Versions: 1.26.40 – 1.26.60 */
		assume_symmetry: boolean;
		/** Versions: 1.26.40 – 1.26.60 */
		unlocking_requirement?: RecipeUnlockingRequirement | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type ShapelessRecipe = {
		/** Versions: 1.26.40 – 1.26.60 */
		recipe_id: LatinString;
		/** Versions: 1.26.40 – 1.26.60 */
		input: RecipeIngredient[];
		/** Versions: 1.26.40 – 1.26.60 */
		output: ItemLegacy[];
		/** Versions: 1.26.40 – 1.26.60 */
		uuid: string;
		/** Versions: 1.26.40 – 1.26.60 */
		block: string;
		/** Versions: 1.26.40 – 1.26.60 */
		priority: number;
		/** Versions: 1.26.40 – 1.26.60 */
		unlocking_requirement?: RecipeUnlockingRequirement | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type MultiRecipe = {
		/** Versions: 1.26.40 – 1.26.60 */
		uuid: string;
		/** Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * SmithingTransformRecipe is a recipe specifically used for smithing tables. It has two input items and adds
	 * them together, resulting in a new item.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type SmithingTransformRecipe = {
		/** RecipeID is a unique ID of the recipe. This ID must be unique amongst all other types of recipes too, but its functionality is not exactly known. Versions: 1.26.40 – 1.26.60 */
		recipe_id: LatinString;
		/** Versions: 1.26.40 – 1.26.60 */
		template: RecipeIngredient;
		/** Base is the item that the Addition is being applied to in the smithing table. Versions: 1.26.40 – 1.26.60 */
		base: RecipeIngredient;
		/** Addition is the item that is being added to the Base item to result in a modified item. Versions: 1.26.40 – 1.26.60 */
		addition: RecipeIngredient;
		/** Result is the resulting item from the two items being added together. Versions: 1.26.40 – 1.26.60 */
		result: ItemLegacy;
		/** Tag is a serialized compound tag in the network little endian format. Versions: 1.26.40 – 1.26.60 */
		tag: string;
		/** RecipeNetworkID is a unique ID used to identify the recipe over network. Each recipe must have a unique network ID. Recommended is to just increment a variable for each unique recipe registered. This field must never be 0. Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type SmithingTrimRecipe = {
		/** Versions: 1.26.40 – 1.26.60 */
		recipe_id: LatinString;
		/** Versions: 1.26.40 – 1.26.60 */
		template: RecipeIngredient;
		/** Versions: 1.26.40 – 1.26.60 */
		input: RecipeIngredient;
		/** Versions: 1.26.40 – 1.26.60 */
		addition: RecipeIngredient;
		/** Versions: 1.26.40 – 1.26.60 */
		block: string;
		/** Versions: 1.26.40 – 1.26.60 */
		network_id: number;
	};
	/**
	 * 1.26.40 reworked most of this type: the three arrays are now varint-counted, the arm size and the piece
	 * types are numeric, the colours are little endian ints instead of strings, and the trusted flag and the
	 * profile hash were appended at the end.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type PersonaPieceType = "unknown" | "skeleton" | "body" | "skin" | "bottom" | "feet" | "dress" | "top" | "high_pants" | "hands" | "outerwear" | "facial_hair" | "mouth" | "eyes" | "hair" | "hood" | "back" | "face_accessory" | "head" | "legs" | "left_leg" | "right_leg" | "arms" | "left_arm" | "right_arm" | "capes" | "classic_skin" | "emote" | "unsupported" | number | "coco";
	/**
	 * As of 1.26.40 the packet-wide action is gone: every record carries its own action, written first as an
	 * unsigned varint (1 = add, 0 = remove) and then again as the legacy action ordinal byte (0 = add,
	 * 1 = remove). The trailing array of skin-verified booleans was removed as well.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type PlayerRecord = {
		/** Versions: 1.26.40 – 1.26.60 */
		type: "remove" | "add" | number;
		/** Versions: 1.26.40 – 1.26.60 */
		legacy_type: number;
		/** Versions: 1.26.40 – 1.26.60 */
		uuid?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		entity_unique_id?: bigint | number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		username?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		xbox_user_id?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		platform_chat_id?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		build_platform?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		skin_data?: Skin | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		is_teacher?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		is_host?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		is_subclient?: boolean | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		player_color?: number | undefined;
		/** Versions: 1.26.60 */
		play_fab_id?: string | undefined;
	};
	/**
	 * The ingredient encoding used inside auto-craft item stack request actions. It differs from
	 * `RecipeIngredient` in that the descriptor kind is numeric (and repeated as a byte) and the count is a
	 * little endian short.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type RecipeIngredient2 = {
		/** Versions: 1.26.40 – 1.26.60 */
		type: "invalid" | "name" | "molang" | "item_tag" | number;
		/** The descriptor kind again, as a byte. The reader ignores it in favour of the varint above. Versions: 1.26.40 – 1.26.60 */
		legacy_type: number;
		/** Versions: 1.26.40 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		metadata?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		expression?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		version?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		tag?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		count: number;
	};
	/**
	 * The item encoding used by the deprecated craft-results item stack request action. Unlike `ItemLegacy` it
	 * identifies the item by name through a descriptor rather than by network ID.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type ItemStackRequestInstanceDescriptor = {
		/** Versions: 1.26.40 – 1.26.60 */
		type: "invalid" | "name" | number;
		/** The descriptor kind again, as a byte. Versions: 1.26.40 – 1.26.60 */
		legacy_type: number;
		/** Versions: 1.26.40 – 1.26.60 */
		name?: string | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		metadata?: number | undefined;
		/** Versions: 1.26.40 – 1.26.60 */
		count: number;
		/** Versions: 1.26.40 – 1.26.60 */
		block_runtime_id: number;
		/** Versions: 1.26.40 – 1.26.60 */
		extra?: ItemExtraDataWithoutBlockingTick | undefined;
	};
	/**
	 * Added in 1.26.40.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type SystemCategory = {
		/** Versions: 1.26.40 – 1.26.60 */
		category_name: string;
		/** Versions: 1.26.40 – 1.26.60 */
		system_index: Int64Write;
	};
	/**
	 * As of 1.26.40 the input flags are no longer a bitfield: they are sent as an optional list of the
	 * ordinals below. The values are unchanged from the old bit positions.
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type InputData = "ascend" | "descend" | "north_jump" | "jump_down" | "sprint_down" | "change_height" | "jumping" | "auto_jumping_in_water" | "sneaking" | "sneak_down" | "up" | "down" | "left" | "right" | "up_left" | "up_right" | "want_up" | "want_down" | "want_down_slow" | "want_up_slow" | "sprinting" | "ascend_block" | "descend_block" | "sneak_toggle_down" | "persist_sneak" | "start_sprinting" | "stop_sprinting" | "start_sneaking" | "stop_sneaking" | "start_swimming" | "stop_swimming" | "start_jumping" | "start_gliding" | "stop_gliding" | "item_interact" | "block_action" | "item_stack_request" | "handled_teleport" | "emoting" | "missed_swing" | "start_crawling" | "stop_crawling" | "start_flying" | "stop_flying" | "received_server_data" | "client_predicted_vehicle" | "paddling_left" | "paddling_right" | "block_breaking_delay_enabled" | "horizontal_collision" | "vertical_collision" | "down_left" | "down_right" | "start_using_item" | "camera_relative_movement_enabled" | "rot_controlled_by_move_direction" | "start_spin_attack" | "stop_spin_attack" | "hotbar_only_touch" | "jump_released_raw" | "jump_pressed_raw" | "jump_current_raw" | "sneak_released_raw" | "sneak_pressed_raw" | "sneak_current_raw" | "internal_update" | number;
	/**
	 * Versions: 1.26.40 – 1.26.60
	 */
	export type SubChunkEntry = {
		dx: number;
		dy: number;
		dz: number;
		result: "undefined" | "success" | "chunk_not_found" | "invalid_dimension" | "player_not_found" | "y_index_out_of_bounds" | "success_all_air" | number;
		payload?: ByteArray | undefined;
		heightmap_type: HeightMapDataType;
		heightmap?: Buffer | HeightMap | undefined;
		render_heightmap_type: HeightMapDataType;
		render_heightmap?: Buffer | HeightMap | undefined;
		blob_id?: Int64Write | undefined;
	}[];
	/**
	 * Added in 1.26.50: sub chunk height maps are sent as 16 rows of 16 heights, each row length-prefixed.
	 * Versions: 1.26.51 – 1.26.60
	 */
	export type HeightMap = number[][];
	/**
	 * Added in 1.26.50: the options a player selected in a furnace-like container UI.
	 * Versions: 1.26.51 – 1.26.60
	 */
	export type FurnaceOptions = {
		/** Versions: 1.26.51 – 1.26.60 */
		left_furnace_tab: number;
		/** Versions: 1.26.51 – 1.26.60 */
		filtering: boolean;
		/** Versions: 1.26.51 – 1.26.60 */
		layout: number;
	};
	/**
	 * Sent by both sides to update the tabs, filtering and layout a player selected in a furnace-like container UI.
	 * Versions: 1.26.51 – 1.26.60
	 */
	export type packet_set_player_furnace_options = {
		/** Versions: 1.26.51 – 1.26.60 */
		furnace_type: "none" | "furnace" | "blast_furnace" | "smoker" | number;
		/** Versions: 1.26.51 – 1.26.60 */
		furnace_options: FurnaceOptions;
	};
	/**
	 * Sent by the server when a record starts playing at a block, such as a music disc inserted into a jukebox.
	 * The handle can be used with clientbound_update_sound_data afterwards.
	 * Versions: 1.26.51 – 1.26.60
	 */
	export type packet_record_started = {
		/** Versions: 1.26.51 – 1.26.60 */
		position: BlockCoordinates;
		/** Versions: 1.26.51 – 1.26.60 */
		handle: Int64Write;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type PassengerOfBlockData = {
		/** Versions: 1.26.60 */
		block_position: BlockCoordinates;
		/** Versions: 1.26.60 */
		offset: vec3f;
		/** Versions: 1.26.60 */
		rotation: number;
		/** Versions: 1.26.60 */
		rotation_limit: number;
		/** Versions: 1.26.60 */
		emote_type: "standing" | "riding" | "laying" | number;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_clientbound_matchmaking_state = {
		/** Versions: 1.26.60 */
		state: "idle" | "matchmaking" | "match_found" | "canceled" | "player_left_party" | "player_left_server" | "server_shutdown" | "timed_out" | "requeue_as_party" | number;
		/** Versions: 1.26.60 */
		destination_name: string;
		/** Versions: 1.26.60 */
		options?: {
			triggering_player_name?: string | undefined;
			triggered_by_local_player?: boolean | undefined;
		} | undefined;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_serverbound_stonecutter_set_recipe = {
		/** Versions: 1.26.60 */
		container_id: number;
		/** Versions: 1.26.60 */
		recipe_index: number;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_clientbound_stonecutter_set_recipe = {
		/** Versions: 1.26.60 */
		player_unique_id: bigint | number;
		/** Versions: 1.26.60 */
		container_id: number;
		/** Versions: 1.26.60 */
		recipe_index: number;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_serverbound_matchmaking_cancel = Record<string, never>;
	/**
	 * Versions: 1.26.60
	 */
	export type packet_set_passenger_of_block = {
		/** Versions: 1.26.60 */
		entity_unique_id: bigint | number;
		/** Versions: 1.26.60 */
		data?: PassengerOfBlockData | undefined;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_serverbound_cursor_item_drag = {
		/** Versions: 1.26.60 */
		state: "start" | "stop" | number;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_clientbound_play_audio_content = {
		/** Versions: 1.26.60 */
		shared_metadata: string;
		/** Versions: 1.26.60 */
		playback_content: string;
		/** Versions: 1.26.60 */
		playback_type: string;
		/** Versions: 1.26.60 */
		name: string;
		/** Versions: 1.26.60 */
		coordinates: BlockCoordinates;
		/** Versions: 1.26.60 */
		volume: number;
		/** Versions: 1.26.60 */
		pitch: number;
		/** Versions: 1.26.60 */
		loop_count: number;
		/** Versions: 1.26.60 */
		bypass_listener_range_check: boolean;
		/** Versions: 1.26.60 */
		handle?: Int64Write | undefined;
		/** Versions: 1.26.60 */
		playback_position_seconds?: number | undefined;
	};
	/**
	 * Versions: 1.26.60
	 */
	export type packet_serverbound_register_audio_content = {
		/** Versions: 1.26.60 */
		registrations: {
			audio_content_id: string;
			shared_metadata: string;
			server_content: string;
			playback_content: string;
		}[];
	};
}

export namespace MCProtocol.Bedrock.Write.Clientbound {
	export interface Packets {
		add_behavior_tree: MCProtocol.Bedrock.Write.Types.packet_add_behavior_tree;
		/** Versions: 1.16.201 – 1.20.50 */
		add_ecs_entity: MCProtocol.Bedrock.Write.Types.packet_add_ecs_entity;
		add_entity: MCProtocol.Bedrock.Write.Types.packet_add_entity;
		add_item_entity: MCProtocol.Bedrock.Write.Types.packet_add_item_entity;
		add_painting: MCProtocol.Bedrock.Write.Types.packet_add_painting;
		add_player: MCProtocol.Bedrock.Write.Types.packet_add_player;
		/** Versions: 1.17.0 – 1.26.60 */
		add_volume_entity: MCProtocol.Bedrock.Write.Types.packet_add_volume_entity;
		adventure_settings: MCProtocol.Bedrock.Write.Types.packet_adventure_settings;
		/** Versions: 1.18.30 – 1.26.60 */
		agent_action: MCProtocol.Bedrock.Write.Types.packet_agent_action;
		/** Versions: 1.20.10 – 1.26.60 */
		agent_animation: MCProtocol.Bedrock.Write.Types.packet_agent_animation;
		animate: MCProtocol.Bedrock.Write.Types.packet_animate;
		animate_entity: MCProtocol.Bedrock.Write.Types.packet_animate_entity;
		anvil_damage: MCProtocol.Bedrock.Write.Types.packet_anvil_damage;
		available_commands: MCProtocol.Bedrock.Write.Types.packet_available_commands;
		available_entity_identifiers: MCProtocol.Bedrock.Write.Types.packet_available_entity_identifiers;
		/** Versions: 1.21.0 – 1.26.60 */
		award_achievement: MCProtocol.Bedrock.Write.Types.packet_award_achievement;
		biome_definition_list: MCProtocol.Bedrock.Write.Types.packet_biome_definition_list;
		block_entity_data: MCProtocol.Bedrock.Write.Types.packet_block_entity_data;
		block_event: MCProtocol.Bedrock.Write.Types.packet_block_event;
		block_pick_request: MCProtocol.Bedrock.Write.Types.packet_block_pick_request;
		book_edit: MCProtocol.Bedrock.Write.Types.packet_book_edit;
		boss_event: MCProtocol.Bedrock.Write.Types.packet_boss_event;
		camera: MCProtocol.Bedrock.Write.Types.packet_camera;
		/** Versions: 1.21.30 – 1.26.60 */
		camera_aim_assist: MCProtocol.Bedrock.Write.Types.packet_camera_aim_assist;
		/** Versions: 1.26.0 – 1.26.60 */
		camera_aim_assist_actor_priority: MCProtocol.Bedrock.Write.Types.packet_camera_aim_assist_actor_priority;
		/** Versions: 1.21.50 – 1.26.60 */
		camera_aim_assist_presets: MCProtocol.Bedrock.Write.Types.packet_camera_aim_assist_presets;
		/** Versions: 1.19.70 – 1.26.60 */
		camera_instruction: MCProtocol.Bedrock.Write.Types.packet_camera_instruction;
		/** Versions: 1.19.70 – 1.26.60 */
		camera_presets: MCProtocol.Bedrock.Write.Types.packet_camera_presets;
		camera_shake: MCProtocol.Bedrock.Write.Types.packet_camera_shake;
		/** Versions: 1.26.0 – 1.26.60 */
		camera_spline: MCProtocol.Bedrock.Write.Types.packet_camera_spline;
		change_dimension: MCProtocol.Bedrock.Write.Types.packet_change_dimension;
		/** Versions: 1.18.30 – 1.26.60 */
		change_mob_property: MCProtocol.Bedrock.Write.Types.packet_change_mob_property;
		chunk_radius_update: MCProtocol.Bedrock.Write.Types.packet_chunk_radius_update;
		client_cache_blob_status: MCProtocol.Bedrock.Write.Types.packet_client_cache_blob_status;
		client_cache_miss_response: MCProtocol.Bedrock.Write.Types.packet_client_cache_miss_response;
		client_cache_status: MCProtocol.Bedrock.Write.Types.packet_client_cache_status;
		/** Versions: 1.21.60 – 1.26.60 */
		client_camera_aim_assist: MCProtocol.Bedrock.Write.Types.packet_client_camera_aim_assist;
		/** Versions: 1.19.60 – 1.26.60 */
		client_cheat_ability: MCProtocol.Bedrock.Write.Types.packet_client_cheat_ability;
		/** Versions: 1.21.60 – 1.26.60 */
		client_movement_prediction_sync: MCProtocol.Bedrock.Write.Types.packet_client_movement_prediction_sync;
		/** Versions: 1.18.11 – 1.26.60 */
		client_start_item_cooldown: MCProtocol.Bedrock.Write.Types.packet_client_start_item_cooldown;
		client_to_server_handshake: MCProtocol.Bedrock.Write.Types.packet_client_to_server_handshake;
		/** Versions: 1.26.10 – 1.26.60 */
		clientbound_attribute_layer_sync: MCProtocol.Bedrock.Write.Types.packet_clientbound_attribute_layer_sync;
		/** Versions: 1.21.2 – 1.26.60 */
		clientbound_close_form: MCProtocol.Bedrock.Write.Types.packet_clientbound_close_form;
		/** Versions: 1.21.80 – 1.26.60 */
		clientbound_controls_scheme: MCProtocol.Bedrock.Write.Types.packet_clientbound_controls_scheme;
		/** Versions: 1.26.0 */
		clientbound_data_driven_ui_close_all_screens: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_driven_ui_close_all_screens;
		/** Versions: 1.26.10 – 1.26.60 */
		clientbound_data_driven_ui_close_screen: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_driven_ui_close_screen;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_data_driven_ui_reload: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_driven_ui_reload;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_data_driven_ui_show_screen: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_driven_ui_show_screen;
		/** Versions: 1.21.130 – 1.26.60 */
		clientbound_data_store: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_store;
		clientbound_map_item_data: MCProtocol.Bedrock.Write.Types.packet_clientbound_map_item_data;
		/** Versions: 1.26.60 */
		clientbound_matchmaking_state: MCProtocol.Bedrock.Write.Types.packet_clientbound_matchmaking_state;
		/** Versions: 1.26.60 */
		clientbound_play_audio_content: MCProtocol.Bedrock.Write.Types.packet_clientbound_play_audio_content;
		/** Versions: 1.26.60 */
		clientbound_stonecutter_set_recipe: MCProtocol.Bedrock.Write.Types.packet_clientbound_stonecutter_set_recipe;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_texture_shift: MCProtocol.Bedrock.Write.Types.packet_clientbound_texture_shift;
		/** Versions: 1.26.30 – 1.26.60 */
		clientbound_update_sound_data: MCProtocol.Bedrock.Write.Types.packet_clientbound_update_sound_data;
		code_builder: MCProtocol.Bedrock.Write.Types.packet_code_builder;
		/** Versions: 1.18.11 – 1.26.60 */
		code_builder_source: MCProtocol.Bedrock.Write.Types.packet_code_builder_source;
		command_block_update: MCProtocol.Bedrock.Write.Types.packet_command_block_update;
		command_output: MCProtocol.Bedrock.Write.Types.packet_command_output;
		command_request: MCProtocol.Bedrock.Write.Types.packet_command_request;
		completed_using_item: MCProtocol.Bedrock.Write.Types.packet_completed_using_item;
		/** Versions: 1.19.80 – 1.26.60 */
		compressed_biome_definitions: MCProtocol.Bedrock.Write.Types.packet_compressed_biome_definitions;
		container_close: MCProtocol.Bedrock.Write.Types.packet_container_close;
		container_open: MCProtocol.Bedrock.Write.Types.packet_container_open;
		/** Versions: 1.21.30 – 1.26.60 */
		container_registry_cleanup: MCProtocol.Bedrock.Write.Types.packet_container_registry_cleanup;
		container_set_data: MCProtocol.Bedrock.Write.Types.packet_container_set_data;
		correct_player_move_prediction: MCProtocol.Bedrock.Write.Types.packet_correct_player_move_prediction;
		crafting_data: MCProtocol.Bedrock.Write.Types.packet_crafting_data;
		crafting_event: MCProtocol.Bedrock.Write.Types.packet_crafting_event;
		/** Versions: 1.17.30 – 1.26.60 */
		create_photo: MCProtocol.Bedrock.Write.Types.packet_create_photo;
		creative_content: MCProtocol.Bedrock.Write.Types.packet_creative_content;
		/** Versions: 1.21.20 – 1.26.60 */
		current_structure_feature: MCProtocol.Bedrock.Write.Types.packet_current_structure_feature;
		/** Versions: 1.19.10 – 1.26.60 */
		death_info: MCProtocol.Bedrock.Write.Types.packet_death_info;
		debug_info: MCProtocol.Bedrock.Write.Types.packet_debug_info;
		/** Versions: 1.16.210 – 1.26.10 */
		debug_renderer: MCProtocol.Bedrock.Write.Types.packet_debug_renderer;
		/** Versions: 1.18.30 – 1.26.60 */
		dimension_data: MCProtocol.Bedrock.Write.Types.packet_dimension_data;
		disconnect: MCProtocol.Bedrock.Write.Types.packet_disconnect;
		/** Versions: 1.19.10 – 1.26.60 */
		editor_network: MCProtocol.Bedrock.Write.Types.packet_editor_network;
		/** Versions: 1.17.30 – 1.26.60 */
		edu_uri_resource_packet: MCProtocol.Bedrock.Write.Types.packet_edu_uri_resource_packet;
		education_settings: MCProtocol.Bedrock.Write.Types.packet_education_settings;
		emote: MCProtocol.Bedrock.Write.Types.packet_emote;
		emote_list: MCProtocol.Bedrock.Write.Types.packet_emote_list;
		entity_event: MCProtocol.Bedrock.Write.Types.packet_entity_event;
		entity_pick_request: MCProtocol.Bedrock.Write.Types.packet_entity_pick_request;
		event: MCProtocol.Bedrock.Write.Types.packet_event;
		/** Versions: 1.19.20 – 1.26.60 */
		feature_registry: MCProtocol.Bedrock.Write.Types.packet_feature_registry;
		filter_text_packet: MCProtocol.Bedrock.Write.Types.packet_filter_text_packet;
		game_rules_changed: MCProtocol.Bedrock.Write.Types.packet_game_rules_changed;
		/** Versions: 1.19.30 – 1.26.60 */
		game_test_request: MCProtocol.Bedrock.Write.Types.packet_game_test_request;
		/** Versions: 1.19.30 – 1.26.60 */
		game_test_results: MCProtocol.Bedrock.Write.Types.packet_game_test_results;
		/** Versions: 1.21.120 – 1.26.60 */
		graphics_override_parameter: MCProtocol.Bedrock.Write.Types.packet_graphics_override_parameter;
		gui_data_pick_item: MCProtocol.Bedrock.Write.Types.packet_gui_data_pick_item;
		hurt_armor: MCProtocol.Bedrock.Write.Types.packet_hurt_armor;
		initiate_web_socket_connection: MCProtocol.Bedrock.Write.Types.packet_initiate_web_socket_connection;
		interact: MCProtocol.Bedrock.Write.Types.packet_interact;
		inventory_content: MCProtocol.Bedrock.Write.Types.packet_inventory_content;
		inventory_slot: MCProtocol.Bedrock.Write.Types.packet_inventory_slot;
		inventory_transaction: MCProtocol.Bedrock.Write.Types.packet_inventory_transaction;
		/** Versions: 1.16.201 – 1.21.50 */
		item_component: MCProtocol.Bedrock.Write.Types.packet_item_component;
		/** Versions: 1.16.201 – 1.20.61 */
		item_frame_drop_item: MCProtocol.Bedrock.Write.Types.packet_item_frame_drop_item;
		/** Versions: 1.21.60 – 1.26.60 */
		item_registry: MCProtocol.Bedrock.Write.Types.packet_item_registry;
		item_stack_request: MCProtocol.Bedrock.Write.Types.packet_item_stack_request;
		item_stack_response: MCProtocol.Bedrock.Write.Types.packet_item_stack_response;
		/** Versions: 1.21.20 – 1.26.60 */
		jigsaw_structure_data: MCProtocol.Bedrock.Write.Types.packet_jigsaw_structure_data;
		lab_table: MCProtocol.Bedrock.Write.Types.packet_lab_table;
		lectern_update: MCProtocol.Bedrock.Write.Types.packet_lectern_update;
		/** Versions: 1.19.1 – 1.26.60 */
		lesson_progress: MCProtocol.Bedrock.Write.Types.packet_lesson_progress;
		level_chunk: MCProtocol.Bedrock.Write.Types.packet_level_chunk;
		level_event: MCProtocol.Bedrock.Write.Types.packet_level_event;
		level_event_generic: MCProtocol.Bedrock.Write.Types.packet_level_event_generic;
		level_sound_event: MCProtocol.Bedrock.Write.Types.packet_level_sound_event;
		level_sound_event_old: MCProtocol.Bedrock.Write.Types.packet_level_sound_event_old;
		level_sound_event_v2: MCProtocol.Bedrock.Write.Types.packet_level_sound_event_v2;
		/** Versions: 1.26.10 – 1.26.60 */
		locator_bar: MCProtocol.Bedrock.Write.Types.packet_locator_bar;
		login: MCProtocol.Bedrock.Write.Types.packet_login;
		map_create_locked_copy: MCProtocol.Bedrock.Write.Types.packet_map_create_locked_copy;
		map_info_request: MCProtocol.Bedrock.Write.Types.packet_map_info_request;
		mob_armor_equipment: MCProtocol.Bedrock.Write.Types.packet_mob_armor_equipment;
		mob_effect: MCProtocol.Bedrock.Write.Types.packet_mob_effect;
		mob_equipment: MCProtocol.Bedrock.Write.Types.packet_mob_equipment;
		modal_form_request: MCProtocol.Bedrock.Write.Types.packet_modal_form_request;
		modal_form_response: MCProtocol.Bedrock.Write.Types.packet_modal_form_response;
		motion_prediction_hints: MCProtocol.Bedrock.Write.Types.packet_motion_prediction_hints;
		move_entity: MCProtocol.Bedrock.Write.Types.packet_move_entity;
		move_entity_delta: MCProtocol.Bedrock.Write.Types.packet_move_entity_delta;
		move_player: MCProtocol.Bedrock.Write.Types.packet_move_player;
		/** Versions: 1.21.42 – 1.26.60 */
		movement_effect: MCProtocol.Bedrock.Write.Types.packet_movement_effect;
		multiplayer_settings: MCProtocol.Bedrock.Write.Types.packet_multiplayer_settings;
		network_chunk_publisher_update: MCProtocol.Bedrock.Write.Types.packet_network_chunk_publisher_update;
		network_settings: MCProtocol.Bedrock.Write.Types.packet_network_settings;
		network_stack_latency: MCProtocol.Bedrock.Write.Types.packet_network_stack_latency;
		/** Versions: 1.17.10 – 1.26.60 */
		npc_dialogue: MCProtocol.Bedrock.Write.Types.packet_npc_dialogue;
		npc_request: MCProtocol.Bedrock.Write.Types.packet_npc_request;
		on_screen_texture_animation: MCProtocol.Bedrock.Write.Types.packet_on_screen_texture_animation;
		/** Versions: 1.19.80 – 1.26.60 */
		open_sign: MCProtocol.Bedrock.Write.Types.packet_open_sign;
		packet_violation_warning: MCProtocol.Bedrock.Write.Types.packet_packet_violation_warning;
		/** Versions: 1.26.10 – 1.26.60 */
		party_changed: MCProtocol.Bedrock.Write.Types.packet_party_changed;
		/** Versions: 1.26.30 – 1.26.60 */
		party_destination_cookie_response: MCProtocol.Bedrock.Write.Types.packet_party_destination_cookie_response;
		/** Versions: 1.17.30 – 1.26.60 */
		photo_info_request: MCProtocol.Bedrock.Write.Types.packet_photo_info_request;
		photo_transfer: MCProtocol.Bedrock.Write.Types.packet_photo_transfer;
		play_sound: MCProtocol.Bedrock.Write.Types.packet_play_sound;
		play_status: MCProtocol.Bedrock.Write.Types.packet_play_status;
		player_action: MCProtocol.Bedrock.Write.Types.packet_player_action;
		player_armor_damage: MCProtocol.Bedrock.Write.Types.packet_player_armor_damage;
		player_auth_input: MCProtocol.Bedrock.Write.Types.packet_player_auth_input;
		player_enchant_options: MCProtocol.Bedrock.Write.Types.packet_player_enchant_options;
		player_fog: MCProtocol.Bedrock.Write.Types.packet_player_fog;
		player_hotbar: MCProtocol.Bedrock.Write.Types.packet_player_hotbar;
		player_input: MCProtocol.Bedrock.Write.Types.packet_player_input;
		player_list: MCProtocol.Bedrock.Write.Types.packet_player_list;
		/** Versions: 1.21.80 – 1.26.60 */
		player_location: MCProtocol.Bedrock.Write.Types.packet_player_location;
		player_skin: MCProtocol.Bedrock.Write.Types.packet_player_skin;
		/** Versions: 1.21.70 – 1.26.60 */
		player_update_entity_overrides: MCProtocol.Bedrock.Write.Types.packet_player_update_entity_overrides;
		/** Versions: 1.21.70 – 1.26.60 */
		player_video_capture: MCProtocol.Bedrock.Write.Types.packet_player_video_capture;
		position_tracking_db_broadcast: MCProtocol.Bedrock.Write.Types.packet_position_tracking_db_broadcast;
		position_tracking_db_request: MCProtocol.Bedrock.Write.Types.packet_position_tracking_db_request;
		/** Versions: 1.26.20 – 1.26.60 */
		primitive_shapes: MCProtocol.Bedrock.Write.Types.packet_primitive_shapes;
		purchase_receipt: MCProtocol.Bedrock.Write.Types.packet_purchase_receipt;
		/** Versions: 1.26.51 – 1.26.60 */
		record_started: MCProtocol.Bedrock.Write.Types.packet_record_started;
		/** Versions: 1.20.30 – 1.26.60 */
		refresh_entitlements: MCProtocol.Bedrock.Write.Types.packet_refresh_entitlements;
		/** Versions: 1.16.201 – 1.20.50 */
		remove_ecs_entity: MCProtocol.Bedrock.Write.Types.packet_remove_ecs_entity;
		remove_entity: MCProtocol.Bedrock.Write.Types.packet_remove_entity;
		remove_objective: MCProtocol.Bedrock.Write.Types.packet_remove_objective;
		/** Versions: 1.17.0 – 1.26.60 */
		remove_volume_entity: MCProtocol.Bedrock.Write.Types.packet_remove_volume_entity;
		/** Versions: 1.19.1 – 1.26.60 */
		request_ability: MCProtocol.Bedrock.Write.Types.packet_request_ability;
		request_chunk_radius: MCProtocol.Bedrock.Write.Types.packet_request_chunk_radius;
		/** Versions: 1.19.30 – 1.26.60 */
		request_network_settings: MCProtocol.Bedrock.Write.Types.packet_request_network_settings;
		/** Versions: 1.19.1 – 1.26.60 */
		request_permissions: MCProtocol.Bedrock.Write.Types.packet_request_permissions;
		resource_pack_chunk_data: MCProtocol.Bedrock.Write.Types.packet_resource_pack_chunk_data;
		resource_pack_chunk_request: MCProtocol.Bedrock.Write.Types.packet_resource_pack_chunk_request;
		resource_pack_client_response: MCProtocol.Bedrock.Write.Types.packet_resource_pack_client_response;
		resource_pack_data_info: MCProtocol.Bedrock.Write.Types.packet_resource_pack_data_info;
		resource_pack_stack: MCProtocol.Bedrock.Write.Types.packet_resource_pack_stack;
		resource_packs_info: MCProtocol.Bedrock.Write.Types.packet_resource_packs_info;
		/** Versions: 1.26.10 – 1.26.60 */
		resource_packs_ready_for_validation: MCProtocol.Bedrock.Write.Types.packet_resource_packs_ready_for_validation;
		respawn: MCProtocol.Bedrock.Write.Types.packet_respawn;
		rider_jump: MCProtocol.Bedrock.Write.Types.packet_rider_jump;
		script_custom_event: MCProtocol.Bedrock.Write.Types.packet_script_custom_event;
		/** Versions: 1.18.11 – 1.26.60 */
		script_message: MCProtocol.Bedrock.Write.Types.packet_script_message;
		/** Versions: 1.26.30 – 1.26.60 */
		send_party_destination_cookie: MCProtocol.Bedrock.Write.Types.packet_send_party_destination_cookie;
		/** Versions: 1.20.50 – 1.26.60 */
		server_post_move: MCProtocol.Bedrock.Write.Types.packet_server_post_move;
		/** Versions: 1.26.20 – 1.26.60 */
		server_presence_info: MCProtocol.Bedrock.Write.Types.packet_server_presence_info;
		/** Versions: 1.21.90 – 1.26.60 */
		server_script_debug_drawer: MCProtocol.Bedrock.Write.Types.packet_server_script_debug_drawer;
		server_settings_request: MCProtocol.Bedrock.Write.Types.packet_server_settings_request;
		server_settings_response: MCProtocol.Bedrock.Write.Types.packet_server_settings_response;
		/** Versions: 1.19.30 – 1.26.60 */
		server_stats: MCProtocol.Bedrock.Write.Types.packet_server_stats;
		/** Versions: 1.26.20 – 1.26.60 */
		server_store_info: MCProtocol.Bedrock.Write.Types.packet_server_store_info;
		server_to_client_handshake: MCProtocol.Bedrock.Write.Types.packet_server_to_client_handshake;
		/** Versions: 1.26.60 */
		serverbound_cursor_item_drag: MCProtocol.Bedrock.Write.Types.packet_serverbound_cursor_item_drag;
		/** Versions: 1.26.10 – 1.26.60 */
		serverbound_data_driven_screen_closed: MCProtocol.Bedrock.Write.Types.packet_serverbound_data_driven_screen_closed;
		/** Versions: 1.21.130 – 1.26.60 */
		serverbound_data_store: MCProtocol.Bedrock.Write.Types.packet_serverbound_data_store;
		/** Versions: 1.21.20 – 1.26.60 */
		serverbound_diagnostics: MCProtocol.Bedrock.Write.Types.packet_serverbound_diagnostics;
		/** Versions: 1.21.20 – 1.26.60 */
		serverbound_loading_screen: MCProtocol.Bedrock.Write.Types.packet_serverbound_loading_screen;
		/** Versions: 1.26.60 */
		serverbound_matchmaking_cancel: MCProtocol.Bedrock.Write.Types.packet_serverbound_matchmaking_cancel;
		/** Versions: 1.21.111 – 1.26.60 */
		serverbound_pack_setting_change: MCProtocol.Bedrock.Write.Types.packet_serverbound_pack_setting_change;
		/** Versions: 1.26.60 */
		serverbound_register_audio_content: MCProtocol.Bedrock.Write.Types.packet_serverbound_register_audio_content;
		/** Versions: 1.26.60 */
		serverbound_stonecutter_set_recipe: MCProtocol.Bedrock.Write.Types.packet_serverbound_stonecutter_set_recipe;
		set_commands_enabled: MCProtocol.Bedrock.Write.Types.packet_set_commands_enabled;
		set_default_game_type: MCProtocol.Bedrock.Write.Types.packet_set_default_game_type;
		set_difficulty: MCProtocol.Bedrock.Write.Types.packet_set_difficulty;
		set_display_objective: MCProtocol.Bedrock.Write.Types.packet_set_display_objective;
		set_entity_data: MCProtocol.Bedrock.Write.Types.packet_set_entity_data;
		set_entity_link: MCProtocol.Bedrock.Write.Types.packet_set_entity_link;
		set_entity_motion: MCProtocol.Bedrock.Write.Types.packet_set_entity_motion;
		set_health: MCProtocol.Bedrock.Write.Types.packet_set_health;
		/** Versions: 1.20.61 – 1.26.60 */
		set_hud: MCProtocol.Bedrock.Write.Types.packet_set_hud;
		set_last_hurt_by: MCProtocol.Bedrock.Write.Types.packet_set_last_hurt_by;
		set_local_player_as_initialized: MCProtocol.Bedrock.Write.Types.packet_set_local_player_as_initialized;
		/** Versions: 1.21.42 – 1.26.60 */
		set_movement_authority: MCProtocol.Bedrock.Write.Types.packet_set_movement_authority;
		/** Versions: 1.26.60 */
		set_passenger_of_block: MCProtocol.Bedrock.Write.Types.packet_set_passenger_of_block;
		/** Versions: 1.26.51 – 1.26.60 */
		set_player_furnace_options: MCProtocol.Bedrock.Write.Types.packet_set_player_furnace_options;
		set_player_game_type: MCProtocol.Bedrock.Write.Types.packet_set_player_game_type;
		/** Versions: 1.20.50 – 1.26.60 */
		set_player_inventory_options: MCProtocol.Bedrock.Write.Types.packet_set_player_inventory_options;
		set_score: MCProtocol.Bedrock.Write.Types.packet_set_score;
		set_scoreboard_identity: MCProtocol.Bedrock.Write.Types.packet_set_scoreboard_identity;
		set_spawn_position: MCProtocol.Bedrock.Write.Types.packet_set_spawn_position;
		set_time: MCProtocol.Bedrock.Write.Types.packet_set_time;
		set_title: MCProtocol.Bedrock.Write.Types.packet_set_title;
		settings_command: MCProtocol.Bedrock.Write.Types.packet_settings_command;
		show_credits: MCProtocol.Bedrock.Write.Types.packet_show_credits;
		show_profile: MCProtocol.Bedrock.Write.Types.packet_show_profile;
		show_store_offer: MCProtocol.Bedrock.Write.Types.packet_show_store_offer;
		simple_event: MCProtocol.Bedrock.Write.Types.packet_simple_event;
		/** Versions: 1.17.10 – 1.26.60 */
		simulation_type: MCProtocol.Bedrock.Write.Types.packet_simulation_type;
		spawn_experience_orb: MCProtocol.Bedrock.Write.Types.packet_spawn_experience_orb;
		spawn_particle_effect: MCProtocol.Bedrock.Write.Types.packet_spawn_particle_effect;
		start_game: MCProtocol.Bedrock.Write.Types.packet_start_game;
		stop_sound: MCProtocol.Bedrock.Write.Types.packet_stop_sound;
		structure_block_update: MCProtocol.Bedrock.Write.Types.packet_structure_block_update;
		structure_template_data_export_request: MCProtocol.Bedrock.Write.Types.packet_structure_template_data_export_request;
		structure_template_data_export_response: MCProtocol.Bedrock.Write.Types.packet_structure_template_data_export_response;
		sub_client_login: MCProtocol.Bedrock.Write.Types.packet_sub_client_login;
		/** Versions: 1.17.40 – 1.26.60 */
		subchunk: MCProtocol.Bedrock.Write.Types.packet_subchunk;
		/** Versions: 1.17.40 – 1.26.60 */
		subchunk_request: MCProtocol.Bedrock.Write.Types.packet_subchunk_request;
		/** Versions: 1.17.0 – 1.26.60 */
		sync_entity_property: MCProtocol.Bedrock.Write.Types.packet_sync_entity_property;
		/** Versions: 1.26.10 – 1.26.60 */
		sync_world_clocks: MCProtocol.Bedrock.Write.Types.packet_sync_world_clocks;
		take_item_entity: MCProtocol.Bedrock.Write.Types.packet_take_item_entity;
		text: MCProtocol.Bedrock.Write.Types.packet_text;
		tick_sync: MCProtocol.Bedrock.Write.Types.packet_tick_sync;
		/** Versions: 1.18.30 – 1.26.60 */
		ticking_areas_load_status: MCProtocol.Bedrock.Write.Types.packet_ticking_areas_load_status;
		/** Versions: 1.19.1 – 1.26.60 */
		toast_request: MCProtocol.Bedrock.Write.Types.packet_toast_request;
		/** Versions: 1.20.50 – 1.26.60 */
		toggle_crafter_slot_request: MCProtocol.Bedrock.Write.Types.packet_toggle_crafter_slot_request;
		transfer: MCProtocol.Bedrock.Write.Types.packet_transfer;
		/** Versions: 1.19.80 – 1.26.60 */
		trim_data: MCProtocol.Bedrock.Write.Types.packet_trim_data;
		/** Versions: 1.19.70 – 1.26.60 */
		unlocked_recipes: MCProtocol.Bedrock.Write.Types.packet_unlocked_recipes;
		/** Versions: 1.19.10 – 1.26.60 */
		update_abilities: MCProtocol.Bedrock.Write.Types.packet_update_abilities;
		/** Versions: 1.19.10 – 1.26.60 */
		update_adventure_settings: MCProtocol.Bedrock.Write.Types.packet_update_adventure_settings;
		update_attributes: MCProtocol.Bedrock.Write.Types.packet_update_attributes;
		update_block: MCProtocol.Bedrock.Write.Types.packet_update_block;
		update_block_properties: MCProtocol.Bedrock.Write.Types.packet_update_block_properties;
		update_block_synced: MCProtocol.Bedrock.Write.Types.packet_update_block_synced;
		/** Versions: 1.19.50 – 1.26.60 */
		update_client_input_locks: MCProtocol.Bedrock.Write.Types.packet_update_client_input_locks;
		/** Versions: 1.21.70 – 1.26.60 */
		update_client_options: MCProtocol.Bedrock.Write.Types.packet_update_client_options;
		update_equipment: MCProtocol.Bedrock.Write.Types.packet_update_equipment;
		update_player_game_type: MCProtocol.Bedrock.Write.Types.packet_update_player_game_type;
		update_soft_enum: MCProtocol.Bedrock.Write.Types.packet_update_soft_enum;
		/** Versions: 1.17.30 – 1.26.60 */
		update_subchunk_blocks: MCProtocol.Bedrock.Write.Types.packet_update_subchunk_blocks;
		update_trade: MCProtocol.Bedrock.Write.Types.packet_update_trade;
		video_stream_connect: MCProtocol.Bedrock.Write.Types.packet_video_stream_connect;
		/** Versions: 1.26.0 – 1.26.60 */
		voxel_shapes: MCProtocol.Bedrock.Write.Types.packet_voxel_shapes;
	}
}

export namespace MCProtocol.Bedrock.Write.Serverbound {
	export interface Packets {
		add_behavior_tree: MCProtocol.Bedrock.Write.Types.packet_add_behavior_tree;
		/** Versions: 1.16.201 – 1.20.50 */
		add_ecs_entity: MCProtocol.Bedrock.Write.Types.packet_add_ecs_entity;
		add_entity: MCProtocol.Bedrock.Write.Types.packet_add_entity;
		add_item_entity: MCProtocol.Bedrock.Write.Types.packet_add_item_entity;
		add_painting: MCProtocol.Bedrock.Write.Types.packet_add_painting;
		add_player: MCProtocol.Bedrock.Write.Types.packet_add_player;
		/** Versions: 1.17.0 – 1.26.60 */
		add_volume_entity: MCProtocol.Bedrock.Write.Types.packet_add_volume_entity;
		adventure_settings: MCProtocol.Bedrock.Write.Types.packet_adventure_settings;
		/** Versions: 1.18.30 – 1.26.60 */
		agent_action: MCProtocol.Bedrock.Write.Types.packet_agent_action;
		/** Versions: 1.20.10 – 1.26.60 */
		agent_animation: MCProtocol.Bedrock.Write.Types.packet_agent_animation;
		animate: MCProtocol.Bedrock.Write.Types.packet_animate;
		animate_entity: MCProtocol.Bedrock.Write.Types.packet_animate_entity;
		anvil_damage: MCProtocol.Bedrock.Write.Types.packet_anvil_damage;
		available_commands: MCProtocol.Bedrock.Write.Types.packet_available_commands;
		available_entity_identifiers: MCProtocol.Bedrock.Write.Types.packet_available_entity_identifiers;
		/** Versions: 1.21.0 – 1.26.60 */
		award_achievement: MCProtocol.Bedrock.Write.Types.packet_award_achievement;
		biome_definition_list: MCProtocol.Bedrock.Write.Types.packet_biome_definition_list;
		block_entity_data: MCProtocol.Bedrock.Write.Types.packet_block_entity_data;
		block_event: MCProtocol.Bedrock.Write.Types.packet_block_event;
		block_pick_request: MCProtocol.Bedrock.Write.Types.packet_block_pick_request;
		book_edit: MCProtocol.Bedrock.Write.Types.packet_book_edit;
		boss_event: MCProtocol.Bedrock.Write.Types.packet_boss_event;
		camera: MCProtocol.Bedrock.Write.Types.packet_camera;
		/** Versions: 1.21.30 – 1.26.60 */
		camera_aim_assist: MCProtocol.Bedrock.Write.Types.packet_camera_aim_assist;
		/** Versions: 1.26.0 – 1.26.60 */
		camera_aim_assist_actor_priority: MCProtocol.Bedrock.Write.Types.packet_camera_aim_assist_actor_priority;
		/** Versions: 1.21.50 – 1.26.60 */
		camera_aim_assist_presets: MCProtocol.Bedrock.Write.Types.packet_camera_aim_assist_presets;
		/** Versions: 1.19.70 – 1.26.60 */
		camera_instruction: MCProtocol.Bedrock.Write.Types.packet_camera_instruction;
		/** Versions: 1.19.70 – 1.26.60 */
		camera_presets: MCProtocol.Bedrock.Write.Types.packet_camera_presets;
		camera_shake: MCProtocol.Bedrock.Write.Types.packet_camera_shake;
		/** Versions: 1.26.0 – 1.26.60 */
		camera_spline: MCProtocol.Bedrock.Write.Types.packet_camera_spline;
		change_dimension: MCProtocol.Bedrock.Write.Types.packet_change_dimension;
		/** Versions: 1.18.30 – 1.26.60 */
		change_mob_property: MCProtocol.Bedrock.Write.Types.packet_change_mob_property;
		chunk_radius_update: MCProtocol.Bedrock.Write.Types.packet_chunk_radius_update;
		client_cache_blob_status: MCProtocol.Bedrock.Write.Types.packet_client_cache_blob_status;
		client_cache_miss_response: MCProtocol.Bedrock.Write.Types.packet_client_cache_miss_response;
		client_cache_status: MCProtocol.Bedrock.Write.Types.packet_client_cache_status;
		/** Versions: 1.21.60 – 1.26.60 */
		client_camera_aim_assist: MCProtocol.Bedrock.Write.Types.packet_client_camera_aim_assist;
		/** Versions: 1.19.60 – 1.26.60 */
		client_cheat_ability: MCProtocol.Bedrock.Write.Types.packet_client_cheat_ability;
		/** Versions: 1.21.60 – 1.26.60 */
		client_movement_prediction_sync: MCProtocol.Bedrock.Write.Types.packet_client_movement_prediction_sync;
		/** Versions: 1.18.11 – 1.26.60 */
		client_start_item_cooldown: MCProtocol.Bedrock.Write.Types.packet_client_start_item_cooldown;
		client_to_server_handshake: MCProtocol.Bedrock.Write.Types.packet_client_to_server_handshake;
		/** Versions: 1.26.10 – 1.26.60 */
		clientbound_attribute_layer_sync: MCProtocol.Bedrock.Write.Types.packet_clientbound_attribute_layer_sync;
		/** Versions: 1.21.2 – 1.26.60 */
		clientbound_close_form: MCProtocol.Bedrock.Write.Types.packet_clientbound_close_form;
		/** Versions: 1.21.80 – 1.26.60 */
		clientbound_controls_scheme: MCProtocol.Bedrock.Write.Types.packet_clientbound_controls_scheme;
		/** Versions: 1.26.0 */
		clientbound_data_driven_ui_close_all_screens: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_driven_ui_close_all_screens;
		/** Versions: 1.26.10 – 1.26.60 */
		clientbound_data_driven_ui_close_screen: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_driven_ui_close_screen;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_data_driven_ui_reload: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_driven_ui_reload;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_data_driven_ui_show_screen: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_driven_ui_show_screen;
		/** Versions: 1.21.130 – 1.26.60 */
		clientbound_data_store: MCProtocol.Bedrock.Write.Types.packet_clientbound_data_store;
		clientbound_map_item_data: MCProtocol.Bedrock.Write.Types.packet_clientbound_map_item_data;
		/** Versions: 1.26.60 */
		clientbound_matchmaking_state: MCProtocol.Bedrock.Write.Types.packet_clientbound_matchmaking_state;
		/** Versions: 1.26.60 */
		clientbound_play_audio_content: MCProtocol.Bedrock.Write.Types.packet_clientbound_play_audio_content;
		/** Versions: 1.26.60 */
		clientbound_stonecutter_set_recipe: MCProtocol.Bedrock.Write.Types.packet_clientbound_stonecutter_set_recipe;
		/** Versions: 1.26.0 – 1.26.60 */
		clientbound_texture_shift: MCProtocol.Bedrock.Write.Types.packet_clientbound_texture_shift;
		/** Versions: 1.26.30 – 1.26.60 */
		clientbound_update_sound_data: MCProtocol.Bedrock.Write.Types.packet_clientbound_update_sound_data;
		code_builder: MCProtocol.Bedrock.Write.Types.packet_code_builder;
		/** Versions: 1.18.11 – 1.26.60 */
		code_builder_source: MCProtocol.Bedrock.Write.Types.packet_code_builder_source;
		command_block_update: MCProtocol.Bedrock.Write.Types.packet_command_block_update;
		command_output: MCProtocol.Bedrock.Write.Types.packet_command_output;
		command_request: MCProtocol.Bedrock.Write.Types.packet_command_request;
		completed_using_item: MCProtocol.Bedrock.Write.Types.packet_completed_using_item;
		/** Versions: 1.19.80 – 1.26.60 */
		compressed_biome_definitions: MCProtocol.Bedrock.Write.Types.packet_compressed_biome_definitions;
		container_close: MCProtocol.Bedrock.Write.Types.packet_container_close;
		container_open: MCProtocol.Bedrock.Write.Types.packet_container_open;
		/** Versions: 1.21.30 – 1.26.60 */
		container_registry_cleanup: MCProtocol.Bedrock.Write.Types.packet_container_registry_cleanup;
		container_set_data: MCProtocol.Bedrock.Write.Types.packet_container_set_data;
		correct_player_move_prediction: MCProtocol.Bedrock.Write.Types.packet_correct_player_move_prediction;
		crafting_data: MCProtocol.Bedrock.Write.Types.packet_crafting_data;
		crafting_event: MCProtocol.Bedrock.Write.Types.packet_crafting_event;
		/** Versions: 1.17.30 – 1.26.60 */
		create_photo: MCProtocol.Bedrock.Write.Types.packet_create_photo;
		creative_content: MCProtocol.Bedrock.Write.Types.packet_creative_content;
		/** Versions: 1.21.20 – 1.26.60 */
		current_structure_feature: MCProtocol.Bedrock.Write.Types.packet_current_structure_feature;
		/** Versions: 1.19.10 – 1.26.60 */
		death_info: MCProtocol.Bedrock.Write.Types.packet_death_info;
		debug_info: MCProtocol.Bedrock.Write.Types.packet_debug_info;
		/** Versions: 1.16.210 – 1.26.10 */
		debug_renderer: MCProtocol.Bedrock.Write.Types.packet_debug_renderer;
		/** Versions: 1.18.30 – 1.26.60 */
		dimension_data: MCProtocol.Bedrock.Write.Types.packet_dimension_data;
		disconnect: MCProtocol.Bedrock.Write.Types.packet_disconnect;
		/** Versions: 1.19.10 – 1.26.60 */
		editor_network: MCProtocol.Bedrock.Write.Types.packet_editor_network;
		/** Versions: 1.17.30 – 1.26.60 */
		edu_uri_resource_packet: MCProtocol.Bedrock.Write.Types.packet_edu_uri_resource_packet;
		education_settings: MCProtocol.Bedrock.Write.Types.packet_education_settings;
		emote: MCProtocol.Bedrock.Write.Types.packet_emote;
		emote_list: MCProtocol.Bedrock.Write.Types.packet_emote_list;
		entity_event: MCProtocol.Bedrock.Write.Types.packet_entity_event;
		entity_pick_request: MCProtocol.Bedrock.Write.Types.packet_entity_pick_request;
		event: MCProtocol.Bedrock.Write.Types.packet_event;
		/** Versions: 1.19.20 – 1.26.60 */
		feature_registry: MCProtocol.Bedrock.Write.Types.packet_feature_registry;
		filter_text_packet: MCProtocol.Bedrock.Write.Types.packet_filter_text_packet;
		game_rules_changed: MCProtocol.Bedrock.Write.Types.packet_game_rules_changed;
		/** Versions: 1.19.30 – 1.26.60 */
		game_test_request: MCProtocol.Bedrock.Write.Types.packet_game_test_request;
		/** Versions: 1.19.30 – 1.26.60 */
		game_test_results: MCProtocol.Bedrock.Write.Types.packet_game_test_results;
		/** Versions: 1.21.120 – 1.26.60 */
		graphics_override_parameter: MCProtocol.Bedrock.Write.Types.packet_graphics_override_parameter;
		gui_data_pick_item: MCProtocol.Bedrock.Write.Types.packet_gui_data_pick_item;
		hurt_armor: MCProtocol.Bedrock.Write.Types.packet_hurt_armor;
		initiate_web_socket_connection: MCProtocol.Bedrock.Write.Types.packet_initiate_web_socket_connection;
		interact: MCProtocol.Bedrock.Write.Types.packet_interact;
		inventory_content: MCProtocol.Bedrock.Write.Types.packet_inventory_content;
		inventory_slot: MCProtocol.Bedrock.Write.Types.packet_inventory_slot;
		inventory_transaction: MCProtocol.Bedrock.Write.Types.packet_inventory_transaction;
		/** Versions: 1.16.201 – 1.21.50 */
		item_component: MCProtocol.Bedrock.Write.Types.packet_item_component;
		/** Versions: 1.16.201 – 1.20.61 */
		item_frame_drop_item: MCProtocol.Bedrock.Write.Types.packet_item_frame_drop_item;
		/** Versions: 1.21.60 – 1.26.60 */
		item_registry: MCProtocol.Bedrock.Write.Types.packet_item_registry;
		item_stack_request: MCProtocol.Bedrock.Write.Types.packet_item_stack_request;
		item_stack_response: MCProtocol.Bedrock.Write.Types.packet_item_stack_response;
		/** Versions: 1.21.20 – 1.26.60 */
		jigsaw_structure_data: MCProtocol.Bedrock.Write.Types.packet_jigsaw_structure_data;
		lab_table: MCProtocol.Bedrock.Write.Types.packet_lab_table;
		lectern_update: MCProtocol.Bedrock.Write.Types.packet_lectern_update;
		/** Versions: 1.19.1 – 1.26.60 */
		lesson_progress: MCProtocol.Bedrock.Write.Types.packet_lesson_progress;
		level_chunk: MCProtocol.Bedrock.Write.Types.packet_level_chunk;
		level_event: MCProtocol.Bedrock.Write.Types.packet_level_event;
		level_event_generic: MCProtocol.Bedrock.Write.Types.packet_level_event_generic;
		level_sound_event: MCProtocol.Bedrock.Write.Types.packet_level_sound_event;
		level_sound_event_old: MCProtocol.Bedrock.Write.Types.packet_level_sound_event_old;
		level_sound_event_v2: MCProtocol.Bedrock.Write.Types.packet_level_sound_event_v2;
		/** Versions: 1.26.10 – 1.26.60 */
		locator_bar: MCProtocol.Bedrock.Write.Types.packet_locator_bar;
		login: MCProtocol.Bedrock.Write.Types.packet_login;
		map_create_locked_copy: MCProtocol.Bedrock.Write.Types.packet_map_create_locked_copy;
		map_info_request: MCProtocol.Bedrock.Write.Types.packet_map_info_request;
		mob_armor_equipment: MCProtocol.Bedrock.Write.Types.packet_mob_armor_equipment;
		mob_effect: MCProtocol.Bedrock.Write.Types.packet_mob_effect;
		mob_equipment: MCProtocol.Bedrock.Write.Types.packet_mob_equipment;
		modal_form_request: MCProtocol.Bedrock.Write.Types.packet_modal_form_request;
		modal_form_response: MCProtocol.Bedrock.Write.Types.packet_modal_form_response;
		motion_prediction_hints: MCProtocol.Bedrock.Write.Types.packet_motion_prediction_hints;
		move_entity: MCProtocol.Bedrock.Write.Types.packet_move_entity;
		move_entity_delta: MCProtocol.Bedrock.Write.Types.packet_move_entity_delta;
		move_player: MCProtocol.Bedrock.Write.Types.packet_move_player;
		/** Versions: 1.21.42 – 1.26.60 */
		movement_effect: MCProtocol.Bedrock.Write.Types.packet_movement_effect;
		multiplayer_settings: MCProtocol.Bedrock.Write.Types.packet_multiplayer_settings;
		network_chunk_publisher_update: MCProtocol.Bedrock.Write.Types.packet_network_chunk_publisher_update;
		network_settings: MCProtocol.Bedrock.Write.Types.packet_network_settings;
		network_stack_latency: MCProtocol.Bedrock.Write.Types.packet_network_stack_latency;
		/** Versions: 1.17.10 – 1.26.60 */
		npc_dialogue: MCProtocol.Bedrock.Write.Types.packet_npc_dialogue;
		npc_request: MCProtocol.Bedrock.Write.Types.packet_npc_request;
		on_screen_texture_animation: MCProtocol.Bedrock.Write.Types.packet_on_screen_texture_animation;
		/** Versions: 1.19.80 – 1.26.60 */
		open_sign: MCProtocol.Bedrock.Write.Types.packet_open_sign;
		packet_violation_warning: MCProtocol.Bedrock.Write.Types.packet_packet_violation_warning;
		/** Versions: 1.26.10 – 1.26.60 */
		party_changed: MCProtocol.Bedrock.Write.Types.packet_party_changed;
		/** Versions: 1.26.30 – 1.26.60 */
		party_destination_cookie_response: MCProtocol.Bedrock.Write.Types.packet_party_destination_cookie_response;
		/** Versions: 1.17.30 – 1.26.60 */
		photo_info_request: MCProtocol.Bedrock.Write.Types.packet_photo_info_request;
		photo_transfer: MCProtocol.Bedrock.Write.Types.packet_photo_transfer;
		play_sound: MCProtocol.Bedrock.Write.Types.packet_play_sound;
		play_status: MCProtocol.Bedrock.Write.Types.packet_play_status;
		player_action: MCProtocol.Bedrock.Write.Types.packet_player_action;
		player_armor_damage: MCProtocol.Bedrock.Write.Types.packet_player_armor_damage;
		player_auth_input: MCProtocol.Bedrock.Write.Types.packet_player_auth_input;
		player_enchant_options: MCProtocol.Bedrock.Write.Types.packet_player_enchant_options;
		player_fog: MCProtocol.Bedrock.Write.Types.packet_player_fog;
		player_hotbar: MCProtocol.Bedrock.Write.Types.packet_player_hotbar;
		player_input: MCProtocol.Bedrock.Write.Types.packet_player_input;
		player_list: MCProtocol.Bedrock.Write.Types.packet_player_list;
		/** Versions: 1.21.80 – 1.26.60 */
		player_location: MCProtocol.Bedrock.Write.Types.packet_player_location;
		player_skin: MCProtocol.Bedrock.Write.Types.packet_player_skin;
		/** Versions: 1.21.70 – 1.26.60 */
		player_update_entity_overrides: MCProtocol.Bedrock.Write.Types.packet_player_update_entity_overrides;
		/** Versions: 1.21.70 – 1.26.60 */
		player_video_capture: MCProtocol.Bedrock.Write.Types.packet_player_video_capture;
		position_tracking_db_broadcast: MCProtocol.Bedrock.Write.Types.packet_position_tracking_db_broadcast;
		position_tracking_db_request: MCProtocol.Bedrock.Write.Types.packet_position_tracking_db_request;
		/** Versions: 1.26.20 – 1.26.60 */
		primitive_shapes: MCProtocol.Bedrock.Write.Types.packet_primitive_shapes;
		purchase_receipt: MCProtocol.Bedrock.Write.Types.packet_purchase_receipt;
		/** Versions: 1.26.51 – 1.26.60 */
		record_started: MCProtocol.Bedrock.Write.Types.packet_record_started;
		/** Versions: 1.20.30 – 1.26.60 */
		refresh_entitlements: MCProtocol.Bedrock.Write.Types.packet_refresh_entitlements;
		/** Versions: 1.16.201 – 1.20.50 */
		remove_ecs_entity: MCProtocol.Bedrock.Write.Types.packet_remove_ecs_entity;
		remove_entity: MCProtocol.Bedrock.Write.Types.packet_remove_entity;
		remove_objective: MCProtocol.Bedrock.Write.Types.packet_remove_objective;
		/** Versions: 1.17.0 – 1.26.60 */
		remove_volume_entity: MCProtocol.Bedrock.Write.Types.packet_remove_volume_entity;
		/** Versions: 1.19.1 – 1.26.60 */
		request_ability: MCProtocol.Bedrock.Write.Types.packet_request_ability;
		request_chunk_radius: MCProtocol.Bedrock.Write.Types.packet_request_chunk_radius;
		/** Versions: 1.19.30 – 1.26.60 */
		request_network_settings: MCProtocol.Bedrock.Write.Types.packet_request_network_settings;
		/** Versions: 1.19.1 – 1.26.60 */
		request_permissions: MCProtocol.Bedrock.Write.Types.packet_request_permissions;
		resource_pack_chunk_data: MCProtocol.Bedrock.Write.Types.packet_resource_pack_chunk_data;
		resource_pack_chunk_request: MCProtocol.Bedrock.Write.Types.packet_resource_pack_chunk_request;
		resource_pack_client_response: MCProtocol.Bedrock.Write.Types.packet_resource_pack_client_response;
		resource_pack_data_info: MCProtocol.Bedrock.Write.Types.packet_resource_pack_data_info;
		resource_pack_stack: MCProtocol.Bedrock.Write.Types.packet_resource_pack_stack;
		resource_packs_info: MCProtocol.Bedrock.Write.Types.packet_resource_packs_info;
		/** Versions: 1.26.10 – 1.26.60 */
		resource_packs_ready_for_validation: MCProtocol.Bedrock.Write.Types.packet_resource_packs_ready_for_validation;
		respawn: MCProtocol.Bedrock.Write.Types.packet_respawn;
		rider_jump: MCProtocol.Bedrock.Write.Types.packet_rider_jump;
		script_custom_event: MCProtocol.Bedrock.Write.Types.packet_script_custom_event;
		/** Versions: 1.18.11 – 1.26.60 */
		script_message: MCProtocol.Bedrock.Write.Types.packet_script_message;
		/** Versions: 1.26.30 – 1.26.60 */
		send_party_destination_cookie: MCProtocol.Bedrock.Write.Types.packet_send_party_destination_cookie;
		/** Versions: 1.20.50 – 1.26.60 */
		server_post_move: MCProtocol.Bedrock.Write.Types.packet_server_post_move;
		/** Versions: 1.26.20 – 1.26.60 */
		server_presence_info: MCProtocol.Bedrock.Write.Types.packet_server_presence_info;
		/** Versions: 1.21.90 – 1.26.60 */
		server_script_debug_drawer: MCProtocol.Bedrock.Write.Types.packet_server_script_debug_drawer;
		server_settings_request: MCProtocol.Bedrock.Write.Types.packet_server_settings_request;
		server_settings_response: MCProtocol.Bedrock.Write.Types.packet_server_settings_response;
		/** Versions: 1.19.30 – 1.26.60 */
		server_stats: MCProtocol.Bedrock.Write.Types.packet_server_stats;
		/** Versions: 1.26.20 – 1.26.60 */
		server_store_info: MCProtocol.Bedrock.Write.Types.packet_server_store_info;
		server_to_client_handshake: MCProtocol.Bedrock.Write.Types.packet_server_to_client_handshake;
		/** Versions: 1.26.60 */
		serverbound_cursor_item_drag: MCProtocol.Bedrock.Write.Types.packet_serverbound_cursor_item_drag;
		/** Versions: 1.26.10 – 1.26.60 */
		serverbound_data_driven_screen_closed: MCProtocol.Bedrock.Write.Types.packet_serverbound_data_driven_screen_closed;
		/** Versions: 1.21.130 – 1.26.60 */
		serverbound_data_store: MCProtocol.Bedrock.Write.Types.packet_serverbound_data_store;
		/** Versions: 1.21.20 – 1.26.60 */
		serverbound_diagnostics: MCProtocol.Bedrock.Write.Types.packet_serverbound_diagnostics;
		/** Versions: 1.21.20 – 1.26.60 */
		serverbound_loading_screen: MCProtocol.Bedrock.Write.Types.packet_serverbound_loading_screen;
		/** Versions: 1.26.60 */
		serverbound_matchmaking_cancel: MCProtocol.Bedrock.Write.Types.packet_serverbound_matchmaking_cancel;
		/** Versions: 1.21.111 – 1.26.60 */
		serverbound_pack_setting_change: MCProtocol.Bedrock.Write.Types.packet_serverbound_pack_setting_change;
		/** Versions: 1.26.60 */
		serverbound_register_audio_content: MCProtocol.Bedrock.Write.Types.packet_serverbound_register_audio_content;
		/** Versions: 1.26.60 */
		serverbound_stonecutter_set_recipe: MCProtocol.Bedrock.Write.Types.packet_serverbound_stonecutter_set_recipe;
		set_commands_enabled: MCProtocol.Bedrock.Write.Types.packet_set_commands_enabled;
		set_default_game_type: MCProtocol.Bedrock.Write.Types.packet_set_default_game_type;
		set_difficulty: MCProtocol.Bedrock.Write.Types.packet_set_difficulty;
		set_display_objective: MCProtocol.Bedrock.Write.Types.packet_set_display_objective;
		set_entity_data: MCProtocol.Bedrock.Write.Types.packet_set_entity_data;
		set_entity_link: MCProtocol.Bedrock.Write.Types.packet_set_entity_link;
		set_entity_motion: MCProtocol.Bedrock.Write.Types.packet_set_entity_motion;
		set_health: MCProtocol.Bedrock.Write.Types.packet_set_health;
		/** Versions: 1.20.61 – 1.26.60 */
		set_hud: MCProtocol.Bedrock.Write.Types.packet_set_hud;
		set_last_hurt_by: MCProtocol.Bedrock.Write.Types.packet_set_last_hurt_by;
		set_local_player_as_initialized: MCProtocol.Bedrock.Write.Types.packet_set_local_player_as_initialized;
		/** Versions: 1.21.42 – 1.26.60 */
		set_movement_authority: MCProtocol.Bedrock.Write.Types.packet_set_movement_authority;
		/** Versions: 1.26.60 */
		set_passenger_of_block: MCProtocol.Bedrock.Write.Types.packet_set_passenger_of_block;
		/** Versions: 1.26.51 – 1.26.60 */
		set_player_furnace_options: MCProtocol.Bedrock.Write.Types.packet_set_player_furnace_options;
		set_player_game_type: MCProtocol.Bedrock.Write.Types.packet_set_player_game_type;
		/** Versions: 1.20.50 – 1.26.60 */
		set_player_inventory_options: MCProtocol.Bedrock.Write.Types.packet_set_player_inventory_options;
		set_score: MCProtocol.Bedrock.Write.Types.packet_set_score;
		set_scoreboard_identity: MCProtocol.Bedrock.Write.Types.packet_set_scoreboard_identity;
		set_spawn_position: MCProtocol.Bedrock.Write.Types.packet_set_spawn_position;
		set_time: MCProtocol.Bedrock.Write.Types.packet_set_time;
		set_title: MCProtocol.Bedrock.Write.Types.packet_set_title;
		settings_command: MCProtocol.Bedrock.Write.Types.packet_settings_command;
		show_credits: MCProtocol.Bedrock.Write.Types.packet_show_credits;
		show_profile: MCProtocol.Bedrock.Write.Types.packet_show_profile;
		show_store_offer: MCProtocol.Bedrock.Write.Types.packet_show_store_offer;
		simple_event: MCProtocol.Bedrock.Write.Types.packet_simple_event;
		/** Versions: 1.17.10 – 1.26.60 */
		simulation_type: MCProtocol.Bedrock.Write.Types.packet_simulation_type;
		spawn_experience_orb: MCProtocol.Bedrock.Write.Types.packet_spawn_experience_orb;
		spawn_particle_effect: MCProtocol.Bedrock.Write.Types.packet_spawn_particle_effect;
		start_game: MCProtocol.Bedrock.Write.Types.packet_start_game;
		stop_sound: MCProtocol.Bedrock.Write.Types.packet_stop_sound;
		structure_block_update: MCProtocol.Bedrock.Write.Types.packet_structure_block_update;
		structure_template_data_export_request: MCProtocol.Bedrock.Write.Types.packet_structure_template_data_export_request;
		structure_template_data_export_response: MCProtocol.Bedrock.Write.Types.packet_structure_template_data_export_response;
		sub_client_login: MCProtocol.Bedrock.Write.Types.packet_sub_client_login;
		/** Versions: 1.17.40 – 1.26.60 */
		subchunk: MCProtocol.Bedrock.Write.Types.packet_subchunk;
		/** Versions: 1.17.40 – 1.26.60 */
		subchunk_request: MCProtocol.Bedrock.Write.Types.packet_subchunk_request;
		/** Versions: 1.17.0 – 1.26.60 */
		sync_entity_property: MCProtocol.Bedrock.Write.Types.packet_sync_entity_property;
		/** Versions: 1.26.10 – 1.26.60 */
		sync_world_clocks: MCProtocol.Bedrock.Write.Types.packet_sync_world_clocks;
		take_item_entity: MCProtocol.Bedrock.Write.Types.packet_take_item_entity;
		text: MCProtocol.Bedrock.Write.Types.packet_text;
		tick_sync: MCProtocol.Bedrock.Write.Types.packet_tick_sync;
		/** Versions: 1.18.30 – 1.26.60 */
		ticking_areas_load_status: MCProtocol.Bedrock.Write.Types.packet_ticking_areas_load_status;
		/** Versions: 1.19.1 – 1.26.60 */
		toast_request: MCProtocol.Bedrock.Write.Types.packet_toast_request;
		/** Versions: 1.20.50 – 1.26.60 */
		toggle_crafter_slot_request: MCProtocol.Bedrock.Write.Types.packet_toggle_crafter_slot_request;
		transfer: MCProtocol.Bedrock.Write.Types.packet_transfer;
		/** Versions: 1.19.80 – 1.26.60 */
		trim_data: MCProtocol.Bedrock.Write.Types.packet_trim_data;
		/** Versions: 1.19.70 – 1.26.60 */
		unlocked_recipes: MCProtocol.Bedrock.Write.Types.packet_unlocked_recipes;
		/** Versions: 1.19.10 – 1.26.60 */
		update_abilities: MCProtocol.Bedrock.Write.Types.packet_update_abilities;
		/** Versions: 1.19.10 – 1.26.60 */
		update_adventure_settings: MCProtocol.Bedrock.Write.Types.packet_update_adventure_settings;
		update_attributes: MCProtocol.Bedrock.Write.Types.packet_update_attributes;
		update_block: MCProtocol.Bedrock.Write.Types.packet_update_block;
		update_block_properties: MCProtocol.Bedrock.Write.Types.packet_update_block_properties;
		update_block_synced: MCProtocol.Bedrock.Write.Types.packet_update_block_synced;
		/** Versions: 1.19.50 – 1.26.60 */
		update_client_input_locks: MCProtocol.Bedrock.Write.Types.packet_update_client_input_locks;
		/** Versions: 1.21.70 – 1.26.60 */
		update_client_options: MCProtocol.Bedrock.Write.Types.packet_update_client_options;
		update_equipment: MCProtocol.Bedrock.Write.Types.packet_update_equipment;
		update_player_game_type: MCProtocol.Bedrock.Write.Types.packet_update_player_game_type;
		update_soft_enum: MCProtocol.Bedrock.Write.Types.packet_update_soft_enum;
		/** Versions: 1.17.30 – 1.26.60 */
		update_subchunk_blocks: MCProtocol.Bedrock.Write.Types.packet_update_subchunk_blocks;
		update_trade: MCProtocol.Bedrock.Write.Types.packet_update_trade;
		video_stream_connect: MCProtocol.Bedrock.Write.Types.packet_video_stream_connect;
		/** Versions: 1.26.0 – 1.26.60 */
		voxel_shapes: MCProtocol.Bedrock.Write.Types.packet_voxel_shapes;
	}
}
