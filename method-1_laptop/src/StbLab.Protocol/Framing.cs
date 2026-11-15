using Google.Protobuf;

namespace StbLab.Protocol;

/// <summary>
/// Length-delimited framing for the Android TV protocols.
/// </summary>
/// <remarks>
/// Both the pairing ("polo") and remote protocols prefix every protobuf payload with a
/// <em>varint</em> length. Several write-ups of this protocol claim a fixed 4-byte
/// big-endian prefix; that is wrong, and the device closes the connection if you send it.
/// The reference implementation (androidtvremote2) uses protobuf's own
/// <c>_EncodeVarint</c>/<c>_DecodeVarint</c> helpers, which is what this mirrors.
/// </remarks>
internal static class Framing
{
    /// <summary>A protobuf varint is at most 10 bytes.</summary>
    public const int MaxVarintBytes = 10;

    /// <summary>Sanity bound so a corrupt length cannot make us allocate wildly.</summary>
    public const int MaxMessageBytes = 4 * 1024 * 1024;

    public static byte[] Encode(IMessage message)
    {
        byte[] payload = message.ToByteArray();
        byte[] frame = new byte[VarintSize((uint)payload.Length) + payload.Length];

        int pos = 0;
        WriteVarint(frame, ref pos, (uint)payload.Length);
        payload.CopyTo(frame, pos);

        return frame;
    }

    public static int VarintSize(uint value)
    {
        int size = 1;
        while (value >= 0x80)
        {
            value >>= 7;
            size++;
        }
        return size;
    }

    public static void WriteVarint(byte[] buffer, ref int pos, uint value)
    {
        while (value >= 0x80)
        {
            buffer[pos++] = (byte)(value | 0x80);
            value >>= 7;
        }
        buffer[pos++] = (byte)value;
    }
}

/// <summary>
/// Reads varint-length-delimited protobuf messages off a stream.
/// </summary>
/// <remarks>
/// A single socket read may deliver a partial message, several messages, or anything in
/// between, and the split can land in the middle of the length varint. Everything is
/// therefore buffered and only handed out once a whole frame is present.
/// </remarks>
internal sealed class FrameReader(Stream stream)
{
    private byte[] _buffer = new byte[16 * 1024];
    private int _length;

    /// <summary>Reads the next frame, or <see langword="null"/> at a clean end of stream.</summary>
    public async ValueTask<byte[]?> ReadAsync(CancellationToken cancellationToken)
    {
        while (true)
        {
            if (TryTake(out byte[] message))
            {
                return message;
            }

            if (!await FillAsync(cancellationToken).ConfigureAwait(false))
            {
                if (_length == 0)
                {
                    return null;
                }

                // The peer went away between the length prefix and the body. Unlike a
                // corrupt length this is usually a normal disconnect, so report it as such.
                throw new EndOfStreamException(
                    $"Connection closed mid-frame with {_length} byte(s) buffered.");
            }
        }
    }

    /// <summary>Attempts to peel one complete frame off the head of the buffer.</summary>
    private bool TryTake(out byte[] message)
    {
        message = [];

        ulong length = 0;
        int shift = 0;
        int pos = 0;
        bool prefixComplete = false;

        for (; pos < _length && pos < Framing.MaxVarintBytes; pos++)
        {
            byte b = _buffer[pos];
            length |= (ulong)(b & 0x7F) << shift;
            if ((b & 0x80) == 0)
            {
                pos++;
                prefixComplete = true;
                break;
            }
            shift += 7;
        }

        if (!prefixComplete)
        {
            if (pos >= Framing.MaxVarintBytes)
            {
                // Cannot resynchronise a stream after a garbage length, so fail loudly
                // rather than silently inventing frame boundaries.
                throw new InvalidDataException("Malformed varint length prefix.");
            }

            return false;
        }

        if (length > Framing.MaxMessageBytes)
        {
            throw new InvalidDataException($"Frame length {length} exceeds the {Framing.MaxMessageBytes} byte limit.");
        }

        int total = pos + (int)length;
        if (_length < total)
        {
            return false;
        }

        message = _buffer[pos..total];

        _length -= total;
        if (_length > 0)
        {
            Buffer.BlockCopy(_buffer, total, _buffer, 0, _length);
        }

        return true;
    }

    private async ValueTask<bool> FillAsync(CancellationToken cancellationToken)
    {
        if (_length == _buffer.Length)
        {
            Array.Resize(ref _buffer, _buffer.Length * 2);
        }

        int read = await stream
            .ReadAsync(_buffer.AsMemory(_length), cancellationToken)
            .ConfigureAwait(false);

        if (read == 0)
        {
            return false;
        }

        _length += read;
        return true;
    }
}
