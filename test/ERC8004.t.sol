// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";
import {ValidationRegistry} from "../src/erc8004/ValidationRegistry.sol";

/// @title Testy ERC-8004 (hermetyczne) — Etap 6 DAO-WARDEN
/// @notice Sprawdza pelny cykl: rejestracja agenta -> agent sklada zadanie walidacji
///         decyzji -> walidator odpowiada ocena -> agregat reputacji. Plus kontrola
///         dostepu i granice wartosci. Zero zaleznosci od sieci.
contract ERC8004Test is Test {
    IdentityRegistry identity;
    ValidationRegistry validation;

    address agent = makeAddr("agent"); // portfel agenta (rejestruje sie sam)
    address validator = makeAddr("validator");
    address outsider = makeAddr("outsider");

    string constant AGENT_URI = "ipfs://bafkAgentCard";

    function setUp() public {
        identity = new IdentityRegistry();
        validation = new ValidationRegistry(address(identity));
    }

    // --- IdentityRegistry ----------------------------------------------------

    function test_RegisterAssignsIncrementingIdsAndOwnership() public {
        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI);

        assertEq(id, 1, "pierwszy agentId = 1");
        assertEq(identity.ownerOf(id), agent, "wlasciciel = rejestrujacy");
        assertEq(identity.tokenURI(id), AGENT_URI, "tokenURI = AgentCard");
        assertEq(identity.getAgentWallet(id), agent, "portfel domyslnie = wlasciciel");
        assertEq(identity.totalRegistered(), 1);

        vm.prank(outsider);
        uint256 id2 = identity.register("ipfs://second");
        assertEq(id2, 2, "kolejny agentId = 2");
    }

    function test_RegisterWithMetadata() public {
        IdentityRegistry.MetadataEntry[] memory md = new IdentityRegistry.MetadataEntry[](2);
        md[0] = IdentityRegistry.MetadataEntry("guards", abi.encodePacked(address(0xBEEF)));
        md[1] = IdentityRegistry.MetadataEntry("framework", bytes("dao-warden"));

        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI, md);

        assertEq(identity.getMetadata(id, "framework"), bytes("dao-warden"));
        assertEq(identity.getMetadata(id, "guards"), abi.encodePacked(address(0xBEEF)));
        assertEq(identity.getMetadata(id, "brak"), bytes(""), "nieustawiony klucz => pusto");
    }

    function test_OnlyOwnerCanSetUri() public {
        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI);

        vm.prank(outsider);
        vm.expectRevert(bytes("IdentityRegistry: not agent owner"));
        identity.setAgentURI(id, "ipfs://hijack");

        vm.prank(agent);
        identity.setAgentURI(id, "ipfs://v2");
        assertEq(identity.tokenURI(id), "ipfs://v2");
    }

    // --- ValidationRegistry: pelny cykl -------------------------------------

    function test_FullDecisionAuditAndReputationCycle() public {
        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI);

        // Agent sklada zadanie walidacji swojej decyzji (audytowalny slad).
        bytes32 reqHash = keccak256("decyzja: WGIP-2 CRITICAL 100 VOTE_NO");
        vm.prank(agent);
        validation.validationRequest(validator, id, "ipfs://decisionRecord", reqHash);

        // Przed odpowiedzia: zadanie istnieje, ale bez oceny.
        {
            (address v, uint256 aId, uint8 resp,,,) = validation.getValidationStatus(reqHash);
            assertEq(v, validator);
            assertEq(aId, id);
            assertEq(resp, 0);
        }
        {
            (uint64 count0,) = validation.getSummary(id, new address[](0), "");
            assertEq(count0, 0, "brak ODPOWIEDZIANYCH walidacji");
        }

        // Walidator ocenia decyzje na 95/100.
        vm.prank(validator);
        validation.validationResponse(reqHash, 95, "ipfs://validatorNote", keccak256("ok"), "attack-defense");

        {
            (,, uint8 resp2,, string memory tag,) = validation.getValidationStatus(reqHash);
            assertEq(resp2, 95);
            assertEq(tag, "attack-defense");
        }
        {
            (uint64 count1, uint8 avg1) = validation.getSummary(id, new address[](0), "");
            assertEq(count1, 1);
            assertEq(avg1, 95, "srednia reputacja = 95");
        }

        // Filtr po tagu i po walidatorze.
        {
            address[] memory vs = new address[](1);
            vs[0] = validator;
            (uint64 count2, uint8 avg2) = validation.getSummary(id, vs, "attack-defense");
            assertEq(count2, 1);
            assertEq(avg2, 95);
        }
        {
            (uint64 count3,) = validation.getSummary(id, new address[](0), "inny-tag");
            assertEq(count3, 0, "filtr taga wyklucza");
        }

        // Indeksy.
        assertEq(validation.getAgentValidations(id).length, 1);
        assertEq(validation.getValidatorRequests(validator).length, 1);
    }

    function test_AverageOverTwoResponses() public {
        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI);

        bytes32 h1 = keccak256("d1");
        bytes32 h2 = keccak256("d2");
        vm.startPrank(agent);
        validation.validationRequest(validator, id, "ipfs://d1", h1);
        validation.validationRequest(validator, id, "ipfs://d2", h2);
        vm.stopPrank();

        vm.startPrank(validator);
        validation.validationResponse(h1, 100, "", bytes32(0), "");
        validation.validationResponse(h2, 80, "", bytes32(0), "");
        vm.stopPrank();

        (uint64 count, uint8 avg) = validation.getSummary(id, new address[](0), "");
        assertEq(count, 2);
        assertEq(avg, 90, "srednia 100 i 80 = 90");
    }

    // --- ValidationRegistry: kontrola dostepu i granice ---------------------

    function test_OnlyAgentOwnerCanRequest() public {
        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI);

        vm.prank(outsider);
        vm.expectRevert(bytes("ValidationRegistry: not agent owner"));
        validation.validationRequest(validator, id, "ipfs://x", keccak256("x"));
    }

    function test_OnlyDesignatedValidatorCanRespond() public {
        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI);
        bytes32 h = keccak256("d");
        vm.prank(agent);
        validation.validationRequest(validator, id, "ipfs://d", h);

        vm.prank(outsider);
        vm.expectRevert(bytes("ValidationRegistry: not validator"));
        validation.validationResponse(h, 50, "", bytes32(0), "");
    }

    function test_ResponseAbove100Reverts() public {
        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI);
        bytes32 h = keccak256("d");
        vm.prank(agent);
        validation.validationRequest(validator, id, "ipfs://d", h);

        vm.prank(validator);
        vm.expectRevert(bytes("ValidationRegistry: response > 100"));
        validation.validationResponse(h, 101, "", bytes32(0), "");
    }

    function test_DuplicateRequestHashReverts() public {
        vm.prank(agent);
        uint256 id = identity.register(AGENT_URI);
        bytes32 h = keccak256("d");
        vm.startPrank(agent);
        validation.validationRequest(validator, id, "ipfs://d", h);
        vm.expectRevert(bytes("ValidationRegistry: request exists"));
        validation.validationRequest(validator, id, "ipfs://d", h);
        vm.stopPrank();
    }

    function test_UnknownRequestResponseReverts() public {
        vm.prank(validator);
        vm.expectRevert(bytes("ValidationRegistry: unknown request"));
        validation.validationResponse(keccak256("nieistnieje"), 50, "", bytes32(0), "");
    }
}
