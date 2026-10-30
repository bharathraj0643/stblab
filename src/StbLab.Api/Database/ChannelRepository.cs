using Microsoft.Data.Sqlite;
using StbLab.Api.Models;

namespace StbLab.Api.Database;

public sealed class ChannelRepository
{
    private readonly string _connectionString = DbInitializer.GetConnectionString();

    public async Task<IReadOnlyList<Genre>> GetGenresAsync(CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);

        // Fetch genres
        List<Genre> genres = [];
        const string genreSql = """
            SELECT id, name, sort_order, created_at, updated_at
            FROM genres
            ORDER BY 
                CASE WHEN sort_order > 0 THEN sort_order ELSE 999999 END ASC,
                created_at ASC,
                id ASC;
            """;

        await using (SqliteCommand genreCmd = connection.CreateCommand())
        {
            genreCmd.CommandText = genreSql;
            await using SqliteDataReader reader = await genreCmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                genres.Add(new Genre(
                    reader.GetInt32(0),
                    reader.GetString(1),
                    reader.GetInt32(2),
                    DateTime.Parse(reader.GetString(3)),
                    DateTime.Parse(reader.GetString(4)),
                    []));
            }
        }

        // Fetch all channels
        const string channelSql = """
            SELECT id, genre_id, name, dummy_number, redirect_number, sort_order, created_at, updated_at
            FROM channels
            ORDER BY 
                CASE WHEN sort_order > 0 THEN sort_order ELSE 999999 END ASC,
                created_at ASC,
                id ASC;
            """;

        Dictionary<int, List<Channel>> channelsByGenre = [];
        await using (SqliteCommand chanCmd = connection.CreateCommand())
        {
            chanCmd.CommandText = channelSql;
            await using SqliteDataReader reader = await chanCmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                int genreId = reader.GetInt32(1);
                if (!channelsByGenre.TryGetValue(genreId, out var list))
                {
                    list = [];
                    channelsByGenre[genreId] = list;
                }

                list.Add(new Channel(
                    reader.GetInt32(0),
                    genreId,
                    reader.GetString(2),
                    reader.GetInt32(3),
                    reader.GetInt32(4),
                    reader.GetInt32(5),
                    DateTime.Parse(reader.GetString(6)),
                    DateTime.Parse(reader.GetString(7))));
            }
        }

        // Attach channels to genres
        return genres.Select(g =>
            g with { Channels = channelsByGenre.TryGetValue(g.Id, out var chs) ? chs : [] }
        ).ToList();
    }

    public async Task<Genre?> GetGenreByIdAsync(int id, CancellationToken ct = default)
    {
        var all = await GetGenresAsync(ct);
        return all.FirstOrDefault(g => g.Id == id);
    }

    public async Task<Genre> CreateGenreAsync(string name, int sortOrder = 0, CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);

        const string sql = """
            INSERT INTO genres (name, sort_order)
            VALUES ($name, $order);
            SELECT last_insert_rowid();
            """;

        await using SqliteCommand cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$name", name.Trim());
        cmd.Parameters.AddWithValue("$order", sortOrder);

        long newId = (long)(await cmd.ExecuteScalarAsync(ct))!;
        return (await GetGenreByIdAsync((int)newId, ct))!;
    }

    public async Task<Genre?> UpdateGenreAsync(int id, string name, int sortOrder, CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);

        const string sql = """
            UPDATE genres
            SET name = $name, sort_order = $order, updated_at = CURRENT_TIMESTAMP
            WHERE id = $id;
            """;

        await using SqliteCommand cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$name", name.Trim());
        cmd.Parameters.AddWithValue("$order", sortOrder);

        int rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows > 0 ? await GetGenreByIdAsync(id, ct) : null;
    }

    public async Task<bool> DeleteGenreAsync(int id, CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);

        const string sql = "DELETE FROM genres WHERE id = $id;";
        await using SqliteCommand cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$id", id);

        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    public async Task<Channel> CreateChannelAsync(int genreId, string name, int dummyNumber, int redirectNumber, int sortOrder = 0, CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);

        const string sql = """
            INSERT INTO channels (genre_id, name, dummy_number, redirect_number, sort_order)
            VALUES ($gid, $name, $dummy, $redirect, $order);
            SELECT last_insert_rowid();
            """;

        await using SqliteCommand cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$gid", genreId);
        cmd.Parameters.AddWithValue("$name", name.Trim());
        cmd.Parameters.AddWithValue("$dummy", dummyNumber);
        cmd.Parameters.AddWithValue("$redirect", redirectNumber);
        cmd.Parameters.AddWithValue("$order", sortOrder);

        long newId = (long)(await cmd.ExecuteScalarAsync(ct))!;

        const string selectSql = """
            SELECT id, genre_id, name, dummy_number, redirect_number, sort_order, created_at, updated_at
            FROM channels WHERE id = $id;
            """;

        await using SqliteCommand selectCmd = connection.CreateCommand();
        selectCmd.CommandText = selectSql;
        selectCmd.Parameters.AddWithValue("$id", newId);
        await using SqliteDataReader reader = await selectCmd.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);

        return new Channel(
            reader.GetInt32(0),
            reader.GetInt32(1),
            reader.GetString(2),
            reader.GetInt32(3),
            reader.GetInt32(4),
            reader.GetInt32(5),
            DateTime.Parse(reader.GetString(6)),
            DateTime.Parse(reader.GetString(7)));
    }

    public async Task<Channel?> UpdateChannelAsync(int id, int genreId, string name, int dummyNumber, int redirectNumber, int sortOrder, CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);

        const string sql = """
            UPDATE channels
            SET genre_id = $gid, name = $name, dummy_number = $dummy, redirect_number = $redirect, sort_order = $order, updated_at = CURRENT_TIMESTAMP
            WHERE id = $id;
            """;

        await using SqliteCommand cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$gid", genreId);
        cmd.Parameters.AddWithValue("$name", name.Trim());
        cmd.Parameters.AddWithValue("$dummy", dummyNumber);
        cmd.Parameters.AddWithValue("$redirect", redirectNumber);
        cmd.Parameters.AddWithValue("$order", sortOrder);

        int rows = await cmd.ExecuteNonQueryAsync(ct);
        if (rows == 0) return null;

        const string selectSql = """
            SELECT id, genre_id, name, dummy_number, redirect_number, sort_order, created_at, updated_at
            FROM channels WHERE id = $id;
            """;

        await using SqliteCommand selectCmd = connection.CreateCommand();
        selectCmd.CommandText = selectSql;
        selectCmd.Parameters.AddWithValue("$id", id);
        await using SqliteDataReader reader = await selectCmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        return new Channel(
            reader.GetInt32(0),
            reader.GetInt32(1),
            reader.GetString(2),
            reader.GetInt32(3),
            reader.GetInt32(4),
            reader.GetInt32(5),
            DateTime.Parse(reader.GetString(6)),
            DateTime.Parse(reader.GetString(7)));
    }

    public async Task<bool> DeleteChannelAsync(int id, CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);

        const string sql = "DELETE FROM channels WHERE id = $id;";
        await using SqliteCommand cmd = connection.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("$id", id);

        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    public async Task ReorderChannelsAsync(int genreId, IReadOnlyList<int> channelIds, CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);
        await using SqliteTransaction tx = (SqliteTransaction)await connection.BeginTransactionAsync(ct);

        for (int i = 0; i < channelIds.Count; i++)
        {
            await using SqliteCommand cmd = connection.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "UPDATE channels SET sort_order = $order, updated_at = CURRENT_TIMESTAMP WHERE id = $id AND genre_id = $gid;";
            cmd.Parameters.AddWithValue("$order", i + 1);
            cmd.Parameters.AddWithValue("$id", channelIds[i]);
            cmd.Parameters.AddWithValue("$gid", genreId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
    }

    /// <summary>
    /// Implements Point 5 search order:
    /// 1. First search that number in "dummy" numbers.
    /// 2. If not found in dummy, search in "redirect" numbers (never looping back to dummy).
    /// </summary>
    public async Task<Channel?> FindChannelByNumberAsync(int number, CancellationToken ct = default)
    {
        await using SqliteConnection connection = new(_connectionString);
        await connection.OpenAsync(ct);

        // Step 1: Search dummy_number
        const string dummySql = """
            SELECT id, genre_id, name, dummy_number, redirect_number, sort_order, created_at, updated_at
            FROM channels
            WHERE dummy_number = $num
            ORDER BY 
                CASE WHEN sort_order > 0 THEN sort_order ELSE 999999 END ASC,
                created_at ASC
            LIMIT 1;
            """;

        await using (SqliteCommand dummyCmd = connection.CreateCommand())
        {
            dummyCmd.CommandText = dummySql;
            dummyCmd.Parameters.AddWithValue("$num", number);
            await using SqliteDataReader reader = await dummyCmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                return new Channel(
                    reader.GetInt32(0),
                    reader.GetInt32(1),
                    reader.GetString(2),
                    reader.GetInt32(3),
                    reader.GetInt32(4),
                    reader.GetInt32(5),
                    DateTime.Parse(reader.GetString(6)),
                    DateTime.Parse(reader.GetString(7)));
            }
        }

        // Step 2: Search redirect_number (without looping back)
        const string redirectSql = """
            SELECT id, genre_id, name, dummy_number, redirect_number, sort_order, created_at, updated_at
            FROM channels
            WHERE redirect_number = $num
            ORDER BY 
                CASE WHEN sort_order > 0 THEN sort_order ELSE 999999 END ASC,
                created_at ASC
            LIMIT 1;
            """;

        await using (SqliteCommand redirCmd = connection.CreateCommand())
        {
            redirCmd.CommandText = redirectSql;
            redirCmd.Parameters.AddWithValue("$num", number);
            await using SqliteDataReader reader = await redirCmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                return new Channel(
                    reader.GetInt32(0),
                    reader.GetInt32(1),
                    reader.GetString(2),
                    reader.GetInt32(3),
                    reader.GetInt32(4),
                    reader.GetInt32(5),
                    DateTime.Parse(reader.GetString(6)),
                    DateTime.Parse(reader.GetString(7)));
            }
        }

        return null;
    }
}
