#!/usr/bin/env python3
"""
Test script for connecting to WT901BLECL via Bluetooth LE
"""
import asyncio
from bleak import BleakScanner, BleakClient

# WT901BLECL service UUID
SERVICE_UUID = "0000ffe5-0000-1000-8000-00805f9a34fb"
CHAR_UUID = "0000ffe4-0000-1000-8000-00805f9a34fb"  # Common characteristic for WitMotion

DEVICE_NAME = "WT901BLE68"
DEVICE_ADDRESS = "DC:14:25:EE:AA:A4"

async def discover_device():
    """Scan for WT901BLE device"""
    print("Scanning for WT901BLE device...")
    devices = await BleakScanner.discover(timeout=10.0)
    
    for device in devices:
        if (device.name and "WT901" in device.name) or device.address == DEVICE_ADDRESS:
            print(f"✓ Found: {device.name} ({device.address})")
            return device.address
    
    print("✗ Device not found")
    return None

async def test_connection(address):
    """Connect to device and read data"""
    print(f"\nConnecting to {address}...")
    
    async with BleakClient(address, timeout=20.0) as client:
        print(f"✓ Connected: {client.is_connected}")
        
        # Discover services
        print("\nDiscovering services...")
        for service in client.services:
            print(f"  Service: {service.uuid}")
            for char in service.characteristics:
                print(f"    Characteristic: {char.uuid}")
                print(f"      Properties: {char.properties}")
        
        # Try to find the data characteristic
        print("\nLooking for data characteristic...")
        data_char = None
        
        # Try common WitMotion UUIDs
        possible_uuids = [
            "0000ffe4-0000-1000-8000-00805f9a34fb",  # Common WitMotion TX
            "0000ffe9-0000-1000-8000-00805f9a34fb",  # Alternative
        ]
        
        for uuid in possible_uuids:
            try:
                # Check if characteristic exists and supports notify
                char = client.services.get_characteristic(uuid)
                if char and "notify" in char.properties:
                    data_char = uuid
                    print(f"✓ Found data characteristic: {uuid}")
                    break
            except:
                continue
        
        if not data_char:
            print("Trying all notify characteristics...")
            for service in client.services:
                for char in service.characteristics:
                    if "notify" in char.properties:
                        data_char = char.uuid
                        print(f"  Found notify characteristic: {char.uuid}")
                        break
                if data_char:
                    break
        
        if not data_char:
            print("✗ No data characteristic found with notify property")
            return
        
        # Try to configure the sensor first
        write_char = "0000ffe9-0000-1000-8000-00805f9a34fb"
        
        print(f"\nSending configuration commands to {write_char}...")
        try:
            # Unlock configuration
            await client.write_gatt_char(write_char, bytes([0xFF, 0xAA, 0x69, 0x88, 0xB5]))
            await asyncio.sleep(0.3)
            
            # Enable all outputs (accel + gyro + angle + mag)
            await client.write_gatt_char(write_char, bytes([0xFF, 0xAA, 0x02, 0x1E, 0x00]))
            await asyncio.sleep(0.3)
            
            # Set output rate to 10Hz
            await client.write_gatt_char(write_char, bytes([0xFF, 0xAA, 0x03, 0x06, 0x00]))
            await asyncio.sleep(0.3)
            
            # Save configuration
            await client.write_gatt_char(write_char, bytes([0xFF, 0xAA, 0x00, 0x00, 0x00]))
            await asyncio.sleep(1)
            
            print("✓ Configuration commands sent, waiting 2 seconds...")
            await asyncio.sleep(2)
        except Exception as e:
            print(f"⚠ Configuration failed: {e}")
        
        # Set up notification handler
        data_received = []
        
        def notification_handler(sender, data):
            """Handle incoming data notifications"""
            data_received.append(data)
            
            # Print hex dump
            hex_str = data.hex()
            print(f"Received {len(data)} bytes: {hex_str[:80]}...")
            
            # Check for frame types
            if b"\x55\x53" in data:
                print("  ✓✓✓ ANGLE frame (0x53) detected!")
            elif b"\x55\x51" in data:
                print("  ✓ ACCEL frame (0x51)")
            elif b"\x55\x52" in data:
                print("  ✓ GYRO frame (0x52)")
            elif b"\x55\x54" in data:
                print("  ✓ MAG frame (0x54)")
            elif b"\x55\x61" in data:
                print("  ✗ Port status frame (0x61)")
        
        # Start notifications
        print(f"\nStarting notifications on {data_char}...")
        await client.start_notify(data_char, notification_handler)
        
        print("Listening for 10 seconds...")
        await asyncio.sleep(10)
        
        await client.stop_notify(data_char)
        
        print(f"\n✓ Received {len(data_received)} data packets")
        
        if data_received:
            # Analyze first packet
            first = data_received[0]
            print(f"\nFirst packet analysis:")
            print(f"  Length: {len(first)} bytes")
            print(f"  Hex: {first.hex()}")
            print(f"  First bytes: {' '.join(f'{b:02x}' for b in first[:20])}")

async def main():
    try:
        # Find device
        address = await discover_device()
        
        if not address:
            address = DEVICE_ADDRESS
            print(f"Using known address: {address}")
        
        # Test connection
        await test_connection(address)
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
